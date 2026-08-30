import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveCharge,
  getEntitlementStatus,
  checkGameStart,
  _clearPricingConfigCache,
} from "./entitlements.js";

const CONFIG = {
  freeGamesPerDay: 2,
  gamePack: { priceInr: 9, credits: 5, expiryHours: 24 },
  monthly: { priceInr: 99, days: 30, fairUseCapPerDay: 50 },
  annual: { priceInr: 599, days: 365, fairUseCapPerDay: 50 },
  enforcementEnabled: true,
};

const minutesAgo = (n) => new Date(Date.now() - n * 60_000);
const daysFromNow = (n) => new Date(Date.now() + n * 24 * 60 * 60_000);
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60_000);

// A minimal in-memory fake with just enough of the Prisma surface
// resolveCharge/charge/checkGameStart touch. $transaction snapshots state
// before running the callback and restores it on throw, so tests can
// verify checkGameStart's all-or-nothing rollback without a real DB.
function createFakePrisma({ pricingConfig = CONFIG, entitlements = [], creditBatches = [], usageEvents = [] } = {}) {
  const state = {
    entitlements: entitlements.map((e) => ({ ...e })),
    creditBatches: creditBatches.map((b) => ({ ...b })),
    usageEvents: usageEvents.map((e) => ({ ...e })),
  };
  let nextEventId = 1;

  const client = {
    pricingConfig: {
      findUnique: async () => (pricingConfig ? { data: pricingConfig } : null),
    },
    entitlement: {
      findFirst: async ({ where }) => {
        const matches = state.entitlements.filter(
          (e) => e.userId === where.userId && e.expiresAt.getTime() > where.expiresAt.gt.getTime()
        );
        matches.sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime());
        return matches[0] ?? null;
      },
    },
    creditBatch: {
      findMany: async ({ where }) => {
        const matches = state.creditBatches.filter(
          (b) =>
            b.userId === where.userId &&
            b.remaining > where.remaining.gt &&
            b.expiresAt.getTime() > where.expiresAt.gt.getTime()
        );
        matches.sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
        return matches;
      },
      update: async ({ where, data }) => {
        const batch = state.creditBatches.find((b) => b.id === where.id);
        if (!batch) throw new Error("batch not found");
        if (data.remaining?.decrement) batch.remaining -= data.remaining.decrement;
        return batch;
      },
    },
    usageEvent: {
      count: async ({ where }) =>
        state.usageEvents.filter((e) => {
          if (e.userId !== where.userId) return false;
          if (e.source !== where.source) return false;
          if (where.playerCount != null && e.playerCount !== where.playerCount) return false;
          return e.consumedAt.getTime() >= where.consumedAt.gte.getTime();
        }).length,
      create: async ({ data }) => {
        const event = { id: `ue_${nextEventId++}`, consumedAt: new Date(), ...data };
        state.usageEvents.push(event);
        return event;
      },
    },
    $transaction: async (fn) => {
      const snapshot = structuredClone(state);
      try {
        return await fn(client);
      } catch (err) {
        state.entitlements = snapshot.entitlements;
        state.creditBatches = snapshot.creditBatches;
        state.usageEvents = snapshot.usageEvents;
        throw err;
      }
    },
    _state: state,
  };
  return client;
}

beforeEach(() => {
  _clearPricingConfigCache();
});

describe("resolveCharge", () => {
  it("allows FREE usage under today's limit", async () => {
    const prisma = createFakePrisma();
    const result = await resolveCharge("u1", 4, prisma);
    expect(result).toEqual({ allowed: true, source: "FREE" });
  });

  it("blocks once today's flat FREE limit is reached", async () => {
    const prisma = createFakePrisma({
      usageEvents: [
        { userId: "u1", roomCode: "AAAAA", role: "HOST", playerCount: 4, source: "FREE", consumedAt: minutesAgo(5) },
        { userId: "u1", roomCode: "BBBBB", role: "HOST", playerCount: 2, source: "FREE", consumedAt: minutesAgo(1) },
      ],
    });
    const result = await resolveCharge("u1", 4, prisma);
    expect(result).toEqual({ allowed: false, reason: "limit_reached" });
  });

  it("prefers a PACK credit over FREE even when FREE isn't exhausted", async () => {
    // Today's FREE allowance for this player count is untouched, but a
    // credit is still spent first — paid credits get used up before the
    // free daily games do, not after.
    const prisma = createFakePrisma({
      creditBatches: [{ id: "cb1", userId: "u1", credits: 5, remaining: 3, expiresAt: daysFromNow(30) }],
    });
    const result = await resolveCharge("u1", 4, prisma);
    expect(result).toEqual({ allowed: true, source: "PACK", creditBatchId: "cb1" });
  });

  it("falls back to FREE once every credit batch is exhausted", async () => {
    const prisma = createFakePrisma({
      creditBatches: [{ id: "cb1", userId: "u1", credits: 5, remaining: 0, expiresAt: daysFromNow(30) }],
    });
    const result = await resolveCharge("u1", 4, prisma);
    expect(result).toEqual({ allowed: true, source: "FREE" });
  });

  it("ignores a batch with exactly zero credits remaining", async () => {
    const prisma = createFakePrisma({
      usageEvents: [
        { userId: "u1", roomCode: "AAAAA", role: "HOST", playerCount: 4, source: "FREE", consumedAt: minutesAgo(5) },
        { userId: "u1", roomCode: "BBBBB", role: "HOST", playerCount: 2, source: "FREE", consumedAt: minutesAgo(1) },
      ],
      creditBatches: [{ id: "cb1", userId: "u1", credits: 5, remaining: 0, expiresAt: daysFromNow(30) }],
    });
    const result = await resolveCharge("u1", 4, prisma);
    expect(result).toEqual({ allowed: false, reason: "limit_reached" });
  });

  it("ignores a batch that has expired even with credits remaining", async () => {
    const prisma = createFakePrisma({
      usageEvents: [
        { userId: "u1", roomCode: "AAAAA", role: "HOST", playerCount: 4, source: "FREE", consumedAt: minutesAgo(5) },
        { userId: "u1", roomCode: "BBBBB", role: "HOST", playerCount: 2, source: "FREE", consumedAt: minutesAgo(1) },
      ],
      creditBatches: [{ id: "cb1", userId: "u1", credits: 5, remaining: 2, expiresAt: daysAgo(1) }],
    });
    const result = await resolveCharge("u1", 4, prisma);
    expect(result).toEqual({ allowed: false, reason: "limit_reached" });
  });

  it("uses an active subscription ahead of FREE/PACK when under the fair-use cap", async () => {
    const prisma = createFakePrisma({
      entitlements: [{ userId: "u1", type: "MONTHLY", startsAt: daysAgo(1), expiresAt: daysFromNow(29) }],
    });
    const result = await resolveCharge("u1", 4, prisma);
    expect(result).toEqual({ allowed: true, source: "SUBSCRIPTION" });
  });

  it("falls back to FREE once the subscription's fair-use cap is hit", async () => {
    const capHits = Array.from({ length: CONFIG.monthly.fairUseCapPerDay }, () => ({
      userId: "u1",
      roomCode: "AAAAA",
      role: "HOST",
      playerCount: 4,
      source: "SUBSCRIPTION",
      consumedAt: minutesAgo(1),
    }));
    const prisma = createFakePrisma({
      entitlements: [{ userId: "u1", type: "MONTHLY", startsAt: daysAgo(1), expiresAt: daysFromNow(29) }],
      usageEvents: capHits,
    });
    const result = await resolveCharge("u1", 4, prisma);
    expect(result).toEqual({ allowed: true, source: "FREE" });
  });

  it("counts a game toward the flat limit the same way regardless of player count", async () => {
    // One 4-player free game today leaves exactly one slot left — for a
    // 2-player game or another 4-player one, it doesn't matter which.
    const prisma = createFakePrisma({
      usageEvents: [{ userId: "u1", roomCode: "AAAAA", role: "HOST", playerCount: 4, source: "FREE", consumedAt: minutesAgo(1) }],
    });
    const two = await resolveCharge("u1", 2, prisma);
    expect(two).toEqual({ allowed: true, source: "FREE" });
  });
});

describe("getEntitlementStatus", () => {
  it("summarizes entitlement, credits, and today's flat free remaining", async () => {
    const prisma = createFakePrisma({
      entitlements: [{ userId: "u1", type: "ANNUAL", startsAt: daysAgo(10), expiresAt: daysFromNow(355) }],
      creditBatches: [{ id: "cb1", userId: "u1", credits: 5, remaining: 4, expiresAt: daysFromNow(80) }],
      usageEvents: [{ userId: "u1", roomCode: "AAAAA", role: "HOST", playerCount: 2, source: "FREE", consumedAt: minutesAgo(1) }],
    });
    const status = await getEntitlementStatus("u1", prisma);
    expect(status.entitlement.type).toBe("ANNUAL");
    expect(status.creditsRemaining).toBe(4);
    expect(status.freeRemaining).toBe(1); // 2/day limit, 1 already used today
  });
});

describe("checkGameStart", () => {
  const room = (overrides = {}) => ({
    code: "AAAAA",
    seats: [
      { id: "seat-host", userId: "host", name: "Host" },
      { id: "seat-joiner", userId: "joiner", name: "Joiner" },
    ],
    hostSeatId: "seat-host",
    ...overrides,
  });

  it("charges the host and each distinct joiner when the host pays via FREE", async () => {
    const prisma = createFakePrisma();
    const result = await checkGameStart(room(), prisma);
    expect(result).toEqual({ ok: true, sponsored: false, source: "FREE" });
    expect(prisma._state.usageEvents).toHaveLength(2);
    expect(prisma._state.usageEvents.map((e) => e.userId).sort()).toEqual(["host", "joiner"]);
  });

  it("sponsors the room and charges nobody else when the host pays via PACK", async () => {
    // Host owns a credit — it's spent even though today's FREE allowance
    // is still untouched, per the credits-before-free priority.
    const prisma = createFakePrisma({
      creditBatches: [{ id: "cb1", userId: "host", credits: 5, remaining: 5, expiresAt: daysFromNow(80) }],
    });
    const result = await checkGameStart(room(), prisma);
    expect(result).toEqual({ ok: true, sponsored: true, source: "PACK" });
    expect(prisma._state.usageEvents).toHaveLength(1);
    expect(prisma._state.usageEvents[0]).toMatchObject({ userId: "host", source: "PACK" });
  });

  it("rolls back the host's charge when a later joiner is blocked", async () => {
    // Joiner already used both of their own flat daily FREE slots today.
    const prisma = createFakePrisma({
      usageEvents: [
        { userId: "joiner", roomCode: "XXXXX", role: "JOINER", playerCount: 2, source: "FREE", consumedAt: minutesAgo(5) },
        { userId: "joiner", roomCode: "YYYYY", role: "JOINER", playerCount: 2, source: "FREE", consumedAt: minutesAgo(1) },
      ],
    });
    const result = await checkGameStart(room(), prisma);
    expect(result).toEqual({ ok: false, seatId: "seat-joiner", name: "Joiner", reason: "limit_reached" });
    // Only the two pre-existing seed events should remain — the host's
    // charge from this failed attempt must not have been committed.
    expect(prisma._state.usageEvents).toHaveLength(2);
    expect(prisma._state.usageEvents.every((e) => e.userId === "joiner")).toBe(true);
  });

  it("charges nobody when the host is a guest (no account) and bots fill the rest", async () => {
    const prisma = createFakePrisma();
    const guestRoom = room({
      seats: [
        { id: "seat-host", userId: null, name: "Guest" },
        { id: "seat-bot", userId: null, name: "Bot 1", bot: true },
      ],
    });
    const result = await checkGameStart(guestRoom, prisma);
    expect(result).toEqual({ ok: true, sponsored: false, source: "FREE" });
    expect(prisma._state.usageEvents).toHaveLength(0);
  });

  it("still charges a signed-in joiner who joined a guest-hosted room", async () => {
    const prisma = createFakePrisma();
    const guestRoom = room({
      seats: [
        { id: "seat-host", userId: null, name: "Guest" },
        { id: "seat-joiner", userId: "joiner", name: "Joiner" },
      ],
    });
    const result = await checkGameStart(guestRoom, prisma);
    expect(result).toEqual({ ok: true, sponsored: false, source: "FREE" });
    expect(prisma._state.usageEvents).toHaveLength(1);
    expect(prisma._state.usageEvents[0]).toMatchObject({ userId: "joiner", role: "JOINER" });
  });
});
