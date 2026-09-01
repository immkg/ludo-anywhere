import type { Payment } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrder } from "@/lib/uropai";
import { getPricingConfig, logEvent } from "@/lib/entitlements";
import { issueCoupon } from "@/lib/coupons";
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

// entitlementWindow lets a Play Billing purchase (see src/lib/play-billing.ts
// and the /api/billing/play routes) pass Google's own authoritative
// startTime/expiryTime instead of deriving the window from
// config.monthly/annual.days — Play's charge is the source of truth for a
// Play purchase, so our records can't drift from what was actually billed.
// eventTypeOverride lets a renewal fire "subscription_renewed" instead of
// "subscription_started" in PostHog, so first purchases and renewals stay
// distinguishable on dashboards even though both flow through this same
// function.
export async function grantPayment(
  payment: Payment,
  opts?: { entitlementWindow?: { startsAt: Date; expiresAt: Date }; eventTypeOverride?: string }
) {
  const config = await getPricingConfig();
  const now = new Date();
  // Captured inside the transaction below (if a coupon was redeemed), read
  // afterward to decide whether to fire flash_offer_paid — see the comment
  // by that call for why this closes a gap the client-side flash_splash_*
  // events (DiscountSplash.tsx) can't see on their own.
  let redeemedCouponRole: string | null = null;

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
      const window = opts?.entitlementWindow ?? {
        startsAt: now,
        expiresAt: new Date(now.getTime() + days * 24 * 60 * 60 * 1000),
      };
      await tx.entitlement.create({
        data: {
          userId: payment.userId,
          type: payment.purpose,
          startsAt: window.startsAt,
          expiresAt: window.expiresAt,
          paymentId: payment.id,
          ...(payment.provider === "PLAY" ? { playPurchaseToken: payment.playPurchaseToken } : {}),
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

    // If this payment redeemed a coupon (see order/route.ts), settle it in
    // the same transaction as the payment itself. A REFEREE_WELCOME coupon
    // redeemed here is exactly the "referee's first payment used the
    // referral coupon" moment the referrer's reward is contingent on — see
    // the Referral/Coupon schema comment in prisma/schema.prisma. If the
    // referee instead paid with a different coupon (or none), nothing here
    // touches their Referral row and it simply stays PENDING forever — the
    // referrer's reward was never earned.
    if (payment.couponId) {
      const coupon = await tx.coupon.update({
        where: { id: payment.couponId },
        data: { status: "REDEEMED", redeemedAt: now, redeemedPaymentId: payment.id },
      });
      redeemedCouponRole = coupon.role;
      if (coupon.role === "REFEREE_WELCOME" && coupon.referralId) {
        const referral = await tx.referral.update({
          where: { id: coupon.referralId },
          data: { status: "REWARDED", resolvedAt: now },
        });
        await issueCoupon(referral.referrerId, "referral", { role: "REFERRER_REWARD" }, tx);
      }
    }

    return true;
  });

  if (granted) {
    const eventType = opts?.eventTypeOverride ?? (payment.purpose === "PACK" ? "pack_purchased" : "subscription_started");
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

    // The client-side flash_splash_shown/dismissed/claim_clicked events
    // (DiscountSplash.tsx) only see intent — this is the one that answers
    // whether the splash actually converts: a payment that redeemed a
    // FLASH_OFFER coupon (see /api/coupons/claim-flash-offer) just settled.
    if (redeemedCouponRole === "FLASH_OFFER") {
      trackPosthog(
        "flash_offer_paid",
        { purpose: payment.purpose, revenue: payment.amountInr, discountInr: payment.discountInr, currency: "INR" },
        payment.userId,
      );
    }
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
