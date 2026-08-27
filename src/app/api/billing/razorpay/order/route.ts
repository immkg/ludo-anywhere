import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRazorpay } from "@/lib/razorpay";
import { getPricingConfig, getEntitlementStatus } from "@/lib/entitlements";
import { getAnnualUpgradeOffer } from "@/lib/pricing";
import type { BillingPurpose, RazorpayOrderResponse } from "@/types/billing";

const VALID_PURPOSES: BillingPurpose[] = ["PACK", "MONTHLY", "ANNUAL"];

// Creates a Razorpay order for the live price read from PricingConfig —
// never the client's own claimed amount — and records a CREATED Payment
// row. Nothing is granted here; only the webhook (razorpay/webhook/route.ts)
// ever marks a Payment PAID and creates the matching Entitlement/CreditBatch.
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

  const order = await getRazorpay().orders.create({
    amount: amountInr * 100, // paise
    currency: "INR",
    notes: { userId: session.user.id, purpose },
  });

  await prisma.payment.create({
    data: {
      userId: session.user.id,
      purpose,
      amountInr,
      discountInr,
      razorpayOrderId: order.id,
      status: "CREATED",
    },
  });

  const response: RazorpayOrderResponse = {
    orderId: order.id,
    amountInr,
    keyId: process.env.RAZORPAY_KEY_ID ?? "",
  };
  return NextResponse.json(response);
}
