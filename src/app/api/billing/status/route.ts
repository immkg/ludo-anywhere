import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEntitlementStatus, getPricingConfig } from "@/lib/entitlements";
import { getAnnualUpgradeOffer, percentOff } from "@/lib/pricing";
import { reconcileOrder } from "@/lib/billing-fulfillment";

// One combined read for the UI: current entitlement/credits/free-remaining
// plus the live prices (and their "% off" framing) from PricingConfig, so
// a card never shows a stale hardcoded number if the config is changed
// later without a deploy.
//
// Also reconciles any of the user's still-CREATED payments against
// Uropai's API first — their webhook is advisory/best-effort only, so the
// pricing page's post-checkout poll of this endpoint is what actually
// guarantees the entitlement lands, not just the webhook delivery.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Only Uropai payments can still be sitting CREATED waiting on this poll
  // — a Play Billing purchase (see /api/billing/play/verify) is verified
  // and granted synchronously, never left pending for this endpoint to
  // reconcile.
  const pending = await prisma.payment.findFirst({
    where: { userId: session.user.id, status: "CREATED", provider: "UROPAI" },
    orderBy: { createdAt: "desc" },
  });
  if (pending?.uropaiOrderId) await reconcileOrder(pending.uropaiOrderId);

  const [status, config] = await Promise.all([
    getEntitlementStatus(session.user.id),
    getPricingConfig(),
  ]);

  return NextResponse.json({
    ...status,
    upgradeOffer: getAnnualUpgradeOffer(status.entitlement, config),
    pricing: {
      gamePack: {
        priceInr: config.gamePack.priceInr,
        originalPriceInr: config.gamePack.originalPriceInr,
        percentOff: percentOff(config.gamePack.originalPriceInr, config.gamePack.priceInr),
        credits: config.gamePack.credits,
        days: Math.round(config.gamePack.expiryHours / 24),
      },
      monthly: {
        priceInr: config.monthly.priceInr,
        originalPriceInr: config.monthly.originalPriceInr,
        percentOff: percentOff(config.monthly.originalPriceInr, config.monthly.priceInr),
        days: config.monthly.days,
      },
      annual: {
        priceInr: config.annual.priceInr,
        originalPriceInr: config.annual.originalPriceInr,
        percentOff: percentOff(config.annual.originalPriceInr, config.annual.priceInr),
        days: config.annual.days,
      },
    },
  });
}
