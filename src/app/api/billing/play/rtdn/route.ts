import { NextResponse } from "next/server";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { getSubscriptionPurchaseV2 } from "@/lib/play-billing";
import { grantPayment } from "@/lib/billing-fulfillment";
import { getPricingConfig, logEvent } from "@/lib/entitlements";

// Real-Time Developer Notifications — Google Play's Pub/Sub push webhook
// for subscription/one-time-product state changes (renewals, cancellations,
// refunds) after the initial purchase (handled synchronously by
// /api/billing/play/verify). Same "the notification is advisory, re-verify
// against the API" principle as reconcileOrder() in billing-fulfillment.ts:
// this never acts on the notification payload's own state, only on what
// getSubscriptionPurchaseV2() reports right now.
//
// Numeric notificationType values, per Google's RTDN reference
// (https://developer.android.com/google/play/billing/rtdn-reference):
const SUBSCRIPTION_RECOVERED = 1;
const SUBSCRIPTION_RENEWED = 2;
const SUBSCRIPTION_REVOKED = 12;
// CANCELED(3)/ON_HOLD(5)/IN_GRACE_PERIOD(6)/PAUSED(10)/EXPIRED(13)/etc are
// intentionally not handled in v1 — Entitlement.expiresAt already governs
// access correctly for cancel/expire (the user keeps access until the date
// already paid for); grace-period leniency is a v2 follow-up.

async function verifyPushToken(request: Request): Promise<boolean> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  const expectedEmail = process.env.RTDN_INVOKER_SERVICE_ACCOUNT_EMAIL;
  if (!token || !expectedEmail) return false;

  // request.url can't be trusted as the audience here — this app runs
  // behind Railway's proxy (a custom server.js, not `next start` directly),
  // so Next sees an internal URL rather than the real public one. Same
  // class of issue AUTH_URL exists to work around elsewhere (see
  // .env.example). The Pub/Sub push subscription signs its OIDC token
  // against the exact endpoint URL it was configured with in Play Console
  // / GCP, so that fixed URL — not whatever request.url resolves to — is
  // the only correct audience to check against.
  const audience = `${process.env.AUTH_URL}/api/billing/play/rtdn`;

  try {
    const client = new google.auth.OAuth2();
    const ticket = await client.verifyIdToken({ idToken: token, audience });
    const payload = ticket.getPayload();
    return payload?.email === expectedEmail && payload?.email_verified === true;
  } catch (e) {
    console.error("Play RTDN: failed to verify push OIDC token", e);
    return false;
  }
}

async function grantRenewal(purchaseToken: string) {
  const purchase = await getSubscriptionPurchaseV2(purchaseToken);
  const entitlement = await findEntitlementByToken(purchaseToken, purchase.linkedPurchaseToken);
  if (!entitlement) {
    console.error(`Play RTDN: no Entitlement found for purchase token ${purchaseToken} (or its linked token)`);
    return;
  }
  if (purchase.subscriptionState !== "SUBSCRIPTION_STATE_ACTIVE" || !purchase.startTime || !purchase.expiryTime) {
    return; // nothing to grant if it isn't actually active with a usable window
  }

  const purpose = entitlement.type as "MONTHLY" | "ANNUAL";
  const config = await getPricingConfig();
  const amountInr = purpose === "MONTHLY" ? config.monthly.priceInr : config.annual.priceInr;

  const payment = await prisma.payment.create({
    data: {
      userId: entitlement.userId,
      purpose,
      amountInr,
      provider: "PLAY",
      playPurchaseToken: purchaseToken,
      playProductId: purchase.productId,
      playOrderId: purchase.orderId,
      status: "CREATED",
    },
  });

  await grantPayment(payment, {
    entitlementWindow: { startsAt: purchase.startTime, expiresAt: purchase.expiryTime },
    eventTypeOverride: "subscription_renewed",
  });
}

// Google may issue a new purchase token on renewal, linked back to the
// previous one — walk that chain since our Entitlement row was stamped
// with whichever token was current when it was created.
async function findEntitlementByToken(purchaseToken: string, linkedPurchaseToken: string | null) {
  const direct = await prisma.entitlement.findUnique({ where: { playPurchaseToken: purchaseToken } });
  if (direct) return direct;
  if (!linkedPurchaseToken) return null;
  return prisma.entitlement.findUnique({ where: { playPurchaseToken: linkedPurchaseToken } });
}

async function revokeByToken(purchaseToken: string) {
  await prisma.entitlement.updateMany({
    where: { playPurchaseToken: purchaseToken },
    data: { expiresAt: new Date() },
  });
}

export async function POST(request: Request) {
  if (!(await verifyPushToken(request))) {
    return NextResponse.json({ error: "Invalid push token" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const dataB64 = body?.message?.data as string | undefined;
  if (!dataB64) return NextResponse.json({ ok: true }); // nothing to do

  const notification = JSON.parse(Buffer.from(dataB64, "base64").toString("utf8"));

  try {
    if (notification.subscriptionNotification) {
      const { notificationType, purchaseToken } = notification.subscriptionNotification;
      if (notificationType === SUBSCRIPTION_RENEWED || notificationType === SUBSCRIPTION_RECOVERED) {
        await grantRenewal(purchaseToken);
      } else if (notificationType === SUBSCRIPTION_REVOKED) {
        await revokeByToken(purchaseToken);
      } else {
        await logEvent("play_rtdn_subscription", null, { notificationType });
      }
    } else if (notification.voidedPurchaseNotification) {
      const { purchaseToken, productType } = notification.voidedPurchaseNotification;
      if (productType === 1) {
        // Subscription refund/chargeback.
        await revokeByToken(purchaseToken);
      } else {
        // One-time product (Game Pack) refund — void unused credits only;
        // games already played against that batch aren't clawed back.
        const payment = await prisma.payment.findUnique({ where: { playPurchaseToken: purchaseToken } });
        if (payment) {
          await prisma.creditBatch.updateMany({ where: { paymentId: payment.id }, data: { remaining: 0 } });
        }
      }
    }
    // testNotification and anything else: no-op, just acknowledge.
  } catch (e) {
    console.error("Play RTDN: error handling notification", notification, e);
    // Still return 200 below — Pub/Sub retries on non-2xx, and a transient
    // failure here will simply redeliver; an unrecoverable one needs a
    // human, not an infinite retry loop.
  }

  return NextResponse.json({ ok: true });
}
