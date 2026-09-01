import { getPrisma } from "./prisma.js";
import { istDayBoundsUtc } from "./time.js";

// Every "can this account do X" decision funnels through resolveCharge()/
// charge() — game code (server.js, the billing API routes) only ever calls
// this module, never reads Entitlement/CreditBatch/UsageEvent directly, so
// pricing rules stay in one place. `prisma` is an injected parameter (not
// the module-level getPrisma() singleton) so the same logic runs
// identically from server.js's socket handlers (src/server/prisma.js) and
// from Next.js route handlers (src/lib/prisma.ts) — see
// src/lib/entitlements.ts for the latter's thin wrapper — and so unit
// tests can pass a mock.

const CONFIG_TTL_MS = 60_000;
let cachedConfig = null;
let cachedAt = 0;

export async function getPricingConfig(prisma = getPrisma()) {
  const now = Date.now();
  if (cachedConfig && now - cachedAt < CONFIG_TTL_MS) return cachedConfig;

  const row = await prisma.pricingConfig.findUnique({ where: { key: "active" } });
  if (!row) throw new Error("PricingConfig not seeded — run `npm run db:seed:pricing`");

  cachedConfig = row.data;
  cachedAt = now;
  return cachedConfig;
}

// Exposed for tests only — the 60s TTL above would otherwise leak a stale
// config between cases that seed different rows.
export function _clearPricingConfigCache() {
  cachedConfig = null;
  cachedAt = 0;
}

async function countUsage(prisma, { userId, source, playerCount, since }) {
  return prisma.usageEvent.count({
    where: {
      userId,
      source,
      ...(playerCount != null ? { playerCount } : {}),
      consumedAt: { gte: since },
    },
  });
}

async function activeEntitlement(prisma, userId, now) {
  return prisma.entitlement.findFirst({
    where: { userId, expiresAt: { gt: now } },
    orderBy: { expiresAt: "desc" },
  });
}

async function availableCredits(prisma, userId, now) {
  const batches = await prisma.creditBatch.findMany({
    where: { userId, remaining: { gt: 0 }, expiresAt: { gt: now } },
    orderBy: { expiresAt: "asc" }, // FIFO — oldest non-expired batch spent first
  });
  return batches;
}

// Pure decision, no writes — safe to call as a dry run (e.g. room:join's
// pre-flight check) as well as the first half of a real charge.
export async function resolveCharge(userId, playerCount, prisma = getPrisma()) {
  const now = new Date();
  const config = await getPricingConfig(prisma);
  const { start } = istDayBoundsUtc(now);

  const entitlement = await activeEntitlement(prisma, userId, now);
  if (entitlement) {
    const usedToday = await countUsage(prisma, { userId, source: "SUBSCRIPTION", since: start });
    if (usedToday < config[entitlement.type.toLowerCase()].fairUseCapPerDay) {
      return { allowed: true, source: "SUBSCRIPTION" };
    }
    // Over the fair-use ceiling — fall through to credits/free rather than
    // hard-blocking a paying subscriber outright.
  }

  // Paid Game Pack credits are spent before free daily games — once you've
  // paid for games, those are what get used up first; the free allowance
  // is the fallback once credits run out, not a slot to burn ahead of them.
  const credits = await availableCredits(prisma, userId, now);
  const totalRemaining = credits.reduce((sum, b) => sum + b.remaining, 0);
  if (totalRemaining > 0) {
    return { allowed: true, source: "PACK", creditBatchId: credits[0].id };
  }

  // Flat daily allowance — a game counts the same toward it regardless of
  // player count, same as a Game Pack credit does.
  const freeUsedToday = await countUsage(prisma, { userId, source: "FREE", since: start });
  if (freeUsedToday < config.freeGamesPerDay) {
    return { allowed: true, source: "FREE" };
  }

  return { allowed: false, reason: "limit_reached" };
}

async function writeCharge(tx, decision, { userId, roomCode, role, playerCount }) {
  await tx.usageEvent.create({
    data: {
      userId,
      roomCode,
      role,
      playerCount,
      source: decision.source,
      creditBatchId: decision.source === "PACK" ? decision.creditBatchId : null,
    },
  });

  if (decision.source === "PACK") {
    await tx.creditBatch.update({
      where: { id: decision.creditBatchId },
      data: { remaining: { decrement: 1 } },
    });
  }
}

// Re-resolves inside a transaction (so a concurrent charge can't double-spend
// the last credit or the last free slot) and writes the UsageEvent.
export async function charge(userId, playerCount, roomCode, role, prisma = getPrisma()) {
  return prisma.$transaction(async (tx) => {
    const decision = await resolveCharge(userId, playerCount, tx);
    if (!decision.allowed) return decision;
    await writeCharge(tx, decision, { userId, roomCode, role, playerCount });
    return decision;
  });
}

// Thrown inside checkGameStart's transaction to abort and roll back every
// charge made so far in the same room-start attempt — a blocked joiner must
// not leave the host (or an earlier joiner) charged for a game that never
// starts. Caught just outside the transaction and turned into the { ok:
// false, ... } result the caller expects.
class ChargeBlockedError extends Error {
  constructor(seatId, name, reason) {
    super(reason);
    this.seatId = seatId;
    this.name_ = name;
    this.reason = reason;
  }
}

export async function getEntitlementStatus(userId, prisma = getPrisma()) {
  const now = new Date();
  const config = await getPricingConfig(prisma);
  const { start } = istDayBoundsUtc(now);

  const entitlement = await activeEntitlement(prisma, userId, now);
  const credits = await availableCredits(prisma, userId, now);
  const totalCredits = credits.reduce((sum, b) => sum + b.remaining, 0);

  const freeUsedToday = await countUsage(prisma, { userId, source: "FREE", since: start });
  const freeRemaining = Math.max(0, config.freeGamesPerDay - freeUsedToday);

  return {
    entitlement: entitlement ? { type: entitlement.type, expiresAt: entitlement.expiresAt } : null,
    creditsRemaining: totalCredits,
    // The LATEST-expiring active batch's date, shown as "valid until". Not
    // just optimistic framing — grantPayment's PACK branch (see
    // src/lib/billing-fulfillment.ts) pulls every other active batch's
    // expiresAt forward to match a new purchase's, so in the normal case
    // all active batches genuinely share this date; this is just reading
    // the max in case of a since-changed expiryHours edge case. Credits
    // are still spent oldest-batch-first (see availableCredits' ascending
    // order, unchanged) — that ordering no longer matters for *when
    // credits are lost*, only for which paymentId a UsageEvent attributes
    // a game to.
    creditsExpireAt: credits.length ? credits[credits.length - 1].expiresAt : null,
    // How many separate packs are currently stacked — the UI shows this as
    // a "×N" badge (see PricingPageClient.tsx / CreditBalance.tsx) so
    // "buy another pack while one's still active" is visible as a count,
    // not just a bigger credits number.
    creditBatchCount: credits.length,
    freeRemaining,
  };
}

// Orchestrates one game:start — see the plan for the sponsorship rule: if
// the host's own charge resolves to a paid source, nobody else in the room
// is charged at all. Every charge in one room-start attempt happens inside
// a single transaction: if any seat turns out blocked, the whole attempt
// rolls back (including the host's own charge) rather than leaving the
// host — or an earlier-charged joiner — spent on a game that never starts.
export async function checkGameStart(room, prisma = getPrisma()) {
  const hostSeat = room.seats.find((s) => s.id === room.hostSeatId);
  if (!hostSeat) return { ok: false, reason: "No host" };
  const hostUserId = hostSeat.userId;

  const playerCount = room.seats.length;

  try {
    return await prisma.$transaction(async (tx) => {
      // A guest host (no account) has nothing to charge or meter — same
      // free-for-guests posture room:join's pre-flight check already
      // documents for a guest joiner. Skip straight to charging whichever
      // OTHER seats are real accounts (e.g. a signed-in friend who joined
      // the guest's room); a room of just a guest host + bots charges
      // nobody at all.
      if (hostUserId) {
        const hostDecision = await resolveCharge(hostUserId, playerCount, tx);
        if (!hostDecision.allowed) {
          throw new ChargeBlockedError(hostSeat.id, hostSeat.name, hostDecision.reason);
        }
        await writeCharge(tx, hostDecision, { userId: hostUserId, roomCode: room.code, role: "HOST", playerCount });
        if (hostDecision.source !== "FREE") {
          return { ok: true, sponsored: true, source: hostDecision.source };
        }
      }

      const chargedUserIds = new Set(hostUserId ? [hostUserId] : []);
      for (const seat of room.seats) {
        if (!seat.userId || chargedUserIds.has(seat.userId)) continue;
        chargedUserIds.add(seat.userId);

        const decision = await resolveCharge(seat.userId, playerCount, tx);
        if (!decision.allowed) throw new ChargeBlockedError(seat.id, seat.name, decision.reason);
        await writeCharge(tx, decision, { userId: seat.userId, roomCode: room.code, role: "JOINER", playerCount });
      }

      return { ok: true, sponsored: false, source: "FREE" };
    });
  } catch (err) {
    if (err instanceof ChargeBlockedError) {
      return { ok: false, seatId: err.seatId, name: err.name_, reason: err.reason };
    }
    throw err;
  }
}

// Fire-and-forget funnel telemetry — mirrors the .catch(logPresenceError(...))
// pattern already used for presence broadcasts in server.js. Never awaited
// by callers that shouldn't block on it.
export async function logEvent(type, userId, properties, prisma = getPrisma()) {
  try {
    await prisma.analyticsEvent.create({ data: { type, userId: userId ?? null, properties: properties ?? {} } });
  } catch (err) {
    console.error(`AnalyticsEvent(${type}) failed:`, err);
  }
}
