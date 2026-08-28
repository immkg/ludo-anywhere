import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createOrder } from "@/lib/uropai";
import { getPricingConfig, getEntitlementStatus } from "@/lib/entitlements";
import { getAnnualUpgradeOffer } from "@/lib/pricing";
import type { BillingPurpose, UropaiOrderResponse } from "@/types/billing";

const VALID_PURPOSES: BillingPurpose[] = ["PACK", "MONTHLY", "ANNUAL"];

// Creates a Uropai order for the live price read from PricingConfig — never
// the client's own claimed amount — and records a CREATED Payment row.
// Nothing is granted here; only reconcileOrder() (called from the webhook
// and from /api/billing/status) ever marks a Payment PAID and creates the
// matching Entitlement/CreditBatch, after confirming with Uropai's API.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const purpose = body?.purpose as BillingPurpose | undefined;
  if (!purpose || !VALID_PURPOSES.includes(purpose)) {
    return NextResponse.json({ error: "Invalid purpose" }, { status: 400 });
  }

  const config = await getPricingConfig();
  let amountInr = purpose === "PACK" ? config.gamePack.priceInr : purpose === "MONTHLY" ? config.monthly.priceInr : config.annual.priceInr;
  let discountInr = 0;

  // The only case the price isn't the flat listed one: an active Monthly
  // subscriber buying ANNUAL gets the day-based upgrade credit — computed
  // here from their real, current entitlement, never from anything the
  // client sends.
  if (purpose === "ANNUAL") {
    const status = await getEntitlementStatus(session.user.id);
    const offer = getAnnualUpgradeOffer(status.entitlement, config);
    if (offer) {
      discountInr = offer.discountInr;
      amountInr = offer.priceInr;
    }
  }

  // Uropai requires HTTPS here, which AUTH_URL isn't guaranteed to be (e.g.
  // local dev pins it to http://localhost to match the registered Google
  // OAuth redirect URI) — UROPAI_PUBLIC_URL lets the two diverge, falling
  // back to AUTH_URL where they're the same origin (e.g. production).
  // returnUrl goes through .../uropai/return, which then redirects to
  // AUTH_URL — the browser's session cookie lives at AUTH_URL, not
  // necessarily at the public origin Uropai is required to send it back to.
  const publicOrigin = process.env.UROPAI_PUBLIC_URL || process.env.AUTH_URL;
  const tenantOrderRef = randomUUID();
  const order = await createOrder({
    tenantOrderRef,
    amount: amountInr,
    currency: "INR",
    customerEmail: session.user.email ?? undefined,
    metaData: { userId: session.user.id, purpose },
    returnUrl: publicOrigin ? `${publicOrigin}/api/billing/uropai/return` : undefined,
    webhookUrl: publicOrigin ? `${publicOrigin}/api/billing/uropai/webhook` : undefined,
  });

  await prisma.payment.create({
    data: {
      userId: session.user.id,
      purpose,
      amountInr,
      discountInr,
      uropaiOrderId: order.id,
      tenantOrderRef,
      status: "CREATED",
    },
  });

  const response: UropaiOrderResponse = {
    orderId: order.id,
    amountInr,
    checkoutUrl: order.openUrl,
  };
  return NextResponse.json(response);
}
