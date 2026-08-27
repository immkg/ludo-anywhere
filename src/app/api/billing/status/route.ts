import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEntitlementStatus, getPricingConfig } from "@/lib/entitlements";
import { getAnnualUpgradeOffer, percentOff } from "@/lib/pricing";

// One combined read for the UI: current entitlement/credits/free-remaining
// plus the live prices (and their "% off" framing) from PricingConfig, so
// a card never shows a stale hardcoded number if the config is changed
// later without a deploy.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

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
      },
      monthly: {
        priceInr: config.monthly.priceInr,
        originalPriceInr: config.monthly.originalPriceInr,
        percentOff: percentOff(config.monthly.originalPriceInr, config.monthly.priceInr),
      },
      annual: {
        priceInr: config.annual.priceInr,
        originalPriceInr: config.annual.originalPriceInr,
        percentOff: percentOff(config.annual.originalPriceInr, config.annual.priceInr),
      },
    },
  });
}
