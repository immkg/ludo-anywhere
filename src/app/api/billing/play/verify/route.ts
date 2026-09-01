import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPricingConfig } from "@/lib/entitlements";
import { grantPayment } from "@/lib/billing-fulfillment";
import {
  getProductPurchase,
  acknowledgeProductPurchase,
  getSubscriptionPurchaseV2,
  acknowledgeSubscriptionPurchase,
  mapPlayProductToPurpose,
} from "@/lib/play-billing";
import { PLAY_PRODUCT_ID_GAME_PACK } from "@/lib/play-products";
import type { Payment } from "@prisma/client";

// Verifies a Google Play Billing purchase made via the Digital Goods API
// (see PricingPageClient.tsx) and grants the same CreditBatch/Entitlement
// the Uropai flow does, by reusing grantPayment() — see
// src/lib/billing-fulfillment.ts. Unlike Uropai's order/webhook split, Play
// purchases arrive here already completed (PaymentRequest.show() is the
// checkout itself) — this route's job is to verify with Google, fulfill,
// then acknowledge, not to initiate anything.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const purchaseToken = body?.purchaseToken as string | undefined;
  const productId = body?.productId as string | undefined;
  if (!purchaseToken || !productId) {
    return NextResponse.json({ error: "Missing purchaseToken or productId" }, { status: 400 });
  }

  // Idempotency: a retried client submit (e.g. a flaky network after
  // response.complete()) must not double-grant. Whatever the current state
  // is, it's already been handled by an earlier call.
  const existing = await prisma.payment.findUnique({ where: { playPurchaseToken: purchaseToken } });
  if (existing) {
    return NextResponse.json({ ok: existing.status === "PAID" });
  }

  let purpose: "PACK" | "MONTHLY" | "ANNUAL";
  let orderId: string | null = null;
  let entitlementWindow: { startsAt: Date; expiresAt: Date } | undefined;

  if (productId === PLAY_PRODUCT_ID_GAME_PACK) {
    const purchase = await getProductPurchase(productId, purchaseToken);
    if (purchase.purchaseState !== 0) {
      return NextResponse.json({ error: "Purchase not in a purchased state" }, { status: 400 });
    }
    purpose = "PACK";
    orderId = purchase.orderId ?? null;
  } else {
    const purchase = await getSubscriptionPurchaseV2(purchaseToken);
    if (purchase.subscriptionState !== "SUBSCRIPTION_STATE_ACTIVE") {
      return NextResponse.json({ error: "Subscription not active" }, { status: 400 });
    }
    const mapped = purchase.productId ? mapPlayProductToPurpose(purchase.productId) : null;
    if (!mapped || mapped === "PACK") {
      return NextResponse.json({ error: "Unrecognized subscription product" }, { status: 400 });
    }
    purpose = mapped;
    orderId = purchase.orderId;
    if (purchase.startTime && purchase.expiryTime) {
      entitlementWindow = { startsAt: purchase.startTime, expiresAt: purchase.expiryTime };
    }
  }

  // amountInr is read from our own flat PricingConfig, not Google's
  // response — v1 ships flat pricing only on Android (see
  // PricingPageClient.tsx), so this keeps the audit trail consistent with
  // the web Payment rows.
  const config = await getPricingConfig();
  const amountInr =
    purpose === "PACK" ? config.gamePack.priceInr : purpose === "MONTHLY" ? config.monthly.priceInr : config.annual.priceInr;

  let payment: Payment;
  try {
    payment = await prisma.payment.create({
      data: {
        userId: session.user.id,
        purpose,
        amountInr,
        provider: "PLAY",
        playPurchaseToken: purchaseToken,
        playProductId: productId,
        playOrderId: orderId,
        status: "CREATED",
      },
    });
  } catch {
    // Unique-constraint race: a concurrent verify call for the same token
    // beat us to it. Fall back to whatever it settled to.
    const raced = await prisma.payment.findUnique({ where: { playPurchaseToken: purchaseToken } });
    if (!raced) throw new Error("Payment creation failed and no existing row found");
    return NextResponse.json({ ok: raced.status === "PAID" });
  }

  await grantPayment(payment, { entitlementWindow });

  // Acknowledge only after our own grant succeeds — acking something we
  // failed to fulfill would permanently lose the ability to detect/retry
  // it. A failed ack still leaves the user fulfilled; it's logged rather
  // than failing the request, since Google auto-refunds unacked purchases
  // after 3 days and this is the one piece worth a human noticing sooner.
  try {
    if (purpose === "PACK") {
      await acknowledgeProductPurchase(productId, purchaseToken);
    } else {
      await acknowledgeSubscriptionPurchase(purchaseToken);
    }
  } catch (e) {
    console.error(`Play Billing: failed to acknowledge purchase ${purchaseToken} (payment ${payment.id})`, e);
  }

  return NextResponse.json({ ok: true });
}
