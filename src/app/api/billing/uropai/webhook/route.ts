import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/uropai";
import { reconcileOrder } from "@/lib/billing-fulfillment";

// Uropai's webhook is explicitly "advisory only, not the source of truth"
// (per their docs) — so unlike a typical webhook handler, this never acts
// on the payload's own status field. It only verifies the signature, pulls
// out the orderId, and defers to reconcileOrder() to re-fetch the order
// from Uropai's API before ever marking a Payment PAID/FAILED.
export async function POST(request: Request) {
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-timestamp");
  const nonce = request.headers.get("x-nonce");
  const signature = request.headers.get("x-signature");

  if (!timestamp || !nonce || !signature || !verifyWebhookSignature(rawBody, { timestamp, nonce, signature })) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(rawBody);
  const orderId = event?.orderId as string | undefined;
  if (orderId) await reconcileOrder(orderId);

  // Always ack with 200 — an unknown/duplicate order or an already-settled
  // Payment is a no-op inside reconcileOrder, not an error.
  return NextResponse.json({ ok: true });
}
