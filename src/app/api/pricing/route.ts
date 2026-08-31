import { NextResponse } from "next/server";
import { getPricingConfig } from "@/lib/entitlements";
import { percentOff } from "@/lib/pricing";

// Public (no auth) — just the live prices, no user-specific entitlement
// data, so guests can read it too (see DiscountSplash.tsx, which needs
// pricing before a guest has ever signed in). /api/billing/status returns
// the same `pricing` shape bundled with entitlement status, but requires a
// session — this is that same shape on its own.
export async function GET() {
  const config = await getPricingConfig();
  return NextResponse.json({
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
  });
}
