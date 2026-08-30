import type { Payment } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrder } from "@/lib/uropai";
import { getPricingConfig, logEvent } from "@/lib/entitlements";
import { trackPosthog } from "@/server/posthog.js";

// Uropai's webhook delivery is best-effort/advisory, not the source of
// truth (per their docs) — so both the webhook route and the status
// endpoint's polling call this to re-fetch the order from Uropai's API
// before ever marking a Payment PAID/FAILED. Never trust the webhook
// payload's own status field, or any client-side callback, directly.
export async function reconcileOrder(uropaiOrderId: string): Promise<void> {
  const payment = await prisma.payment.findUnique({ where: { uropaiOrderId } });
  if (!payment || payment.status !== "CREATED") return; // already settled, or an order we don't know about

  // Reconciliation is best-effort: a lookup failure (Uropai's API down, or
  // an order Uropai doesn't recognize — e.g. a stale pre-cutover row from
  // before this gateway existed) must never break the caller, since both
  // callers (the webhook and the status endpoint's poll) need to keep
  // working regardless. It'll just get retried on the next poll/delivery.
  let order;
  try {
    order = await getOrder(uropaiOrderId);
  } catch (e) {
    console.error(`reconcileOrder: failed to fetch order ${uropaiOrderId}`, e);
    return;
  }

  if (order.status === "PAID") {
    await grantPayment(payment);
  } else if (order.status === "FAILED" || order.status === "EXPIRED" || order.status === "CANCELLED") {
    await failPayment(payment);
  }
  // PENDING: leave as CREATED — a later poll or webhook delivery will settle it.
}

async function grantPayment(payment: Payment) {
  const config = await getPricingConfig();
  const now = new Date();

  const granted = await prisma.$transaction(async (tx) => {
    const updated = await tx.payment.updateMany({
      where: { id: payment.id, status: "CREATED" },
      data: { status: "PAID", verifiedAt: now },
    });
    if (updated.count === 0) return false; // already processed by a concurrent reconcile

    if (payment.purpose === "PACK") {
      await tx.creditBatch.create({
        data: {
          userId: payment.userId,
          credits: config.gamePack.credits,
          remaining: config.gamePack.credits,
          expiresAt: new Date(now.getTime() + config.gamePack.expiryHours * 60 * 60 * 1000),
          paymentId: payment.id,
        },
      });
    } else {
      const days = payment.purpose === "MONTHLY" ? config.monthly.days : config.annual.days;
      await tx.entitlement.create({
        data: {
          userId: payment.userId,
          type: payment.purpose,
          startsAt: now,
          expiresAt: new Date(now.getTime() + days * 24 * 60 * 60 * 1000),
          paymentId: payment.id,
        },
      });
      // A Monthly subscriber upgrading to Annual (or otherwise buying a
      // second subscription): the new one takes over immediately — expire
      // whatever else was still active rather than leaving two rows
      // "active" at once. The upgrade discount already priced this in.
      await tx.entitlement.updateMany({
        where: { userId: payment.userId, expiresAt: { gt: now }, paymentId: { not: payment.id } },
        data: { expiresAt: now },
      });
    }
    return true;
  });

  if (granted) {
    const eventType = payment.purpose === "PACK" ? "pack_purchased" : "subscription_started";
    await logEvent(eventType, payment.userId, { purpose: payment.purpose, amountInr: payment.amountInr });
    // revenue/currency were Umami's special property names for its Revenue
    // report. Kept as plain properties here — PostHog's revenue analytics
    // setup (which event/property shape it expects) hasn't been configured
    // yet; verify against posthog.com/docs/data/revenue-analytics before
    // relying on a built-in revenue dashboard.
    //
    // $set is PostHog's special property key for updating the *person*
    // profile, not just this one event — needed so "current paying
    // customers" / "breakdown by plan" dashboards can query person state
    // directly instead of re-deriving it from purchase-event history each
    // time (a PACK purchase doesn't change plan since it's a one-off, not a
    // subscription).
    trackPosthog(
      eventType,
      {
        purpose: payment.purpose,
        revenue: payment.amountInr,
        currency: "INR",
        $set: {
          is_paying_customer: true,
          ...(payment.purpose !== "PACK" ? { plan: payment.purpose } : {}),
        },
      },
      payment.userId,
    );
  }
}

async function failPayment(payment: Payment) {
  const updated = await prisma.payment.updateMany({
    where: { id: payment.id, status: "CREATED" },
    data: { status: "FAILED" },
  });
  if (updated.count > 0) {
    await logEvent("payment_failed", payment.userId, { purpose: payment.purpose });
    trackPosthog("payment_failed", { purpose: payment.purpose }, payment.userId);
  }
}
