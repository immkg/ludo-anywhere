import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import { prisma } from "@/lib/prisma";
import { getPricingConfig, logEvent } from "@/lib/entitlements";

// The only place a Payment is ever marked PAID and an Entitlement/
// CreditBatch is ever granted — never the client's own post-checkout
// callback, which only reflects /api/billing/status. Verifies the raw
// body against X-Razorpay-Signature before touching anything; idempotent
// via Payment.razorpayPaymentId's unique constraint and by only acting
// when the row is still CREATED (a redelivered webhook — Razorpay retries
// on any non-2xx — finds it already PAID/FAILED and no-ops).
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!signature || !secret || !Razorpay.validateWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(rawBody);
  const paymentEntity = event?.payload?.payment?.entity;

  if (event.event === "payment.captured" && paymentEntity) {
    await handleCaptured(paymentEntity);
  } else if (event.event === "payment.failed" && paymentEntity) {
    await handleFailed(paymentEntity);
  }
  // Any other event type is one we don't act on — still ack with 200 so
  // Razorpay doesn't retry it forever.

  return NextResponse.json({ ok: true });
}

async function handleCaptured(paymentEntity: { id: string; order_id: string }) {
  const payment = await prisma.payment.findUnique({ where: { razorpayOrderId: paymentEntity.order_id } });
  if (!payment) return;

  const config = await getPricingConfig();
  const now = new Date();

  const granted = await prisma.$transaction(async (tx) => {
    const updated = await tx.payment.updateMany({
      where: { id: payment.id, status: "CREATED" },
      data: { status: "PAID", verifiedAt: now, razorpayPaymentId: paymentEntity.id },
    });
    if (updated.count === 0) return false; // already processed by an earlier delivery

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
  }
}

async function handleFailed(paymentEntity: { order_id: string }) {
  const payment = await prisma.payment.findUnique({ where: { razorpayOrderId: paymentEntity.order_id } });
  if (!payment) return;

  const updated = await prisma.payment.updateMany({
    where: { id: payment.id, status: "CREATED" },
    data: { status: "FAILED" },
  });
  if (updated.count > 0) {
    await logEvent("payment_failed", payment.userId, { purpose: payment.purpose });
  }
}
