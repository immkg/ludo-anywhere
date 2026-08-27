// Pure pricing math — deliberately has no dependency on Prisma or any
// other I/O (unlike src/lib/entitlements.ts), so it's trivial to unit test
// and safe to call from anywhere without pulling in a DB client.
import type { PricingConfigData, EntitlementStatus } from "@/server/entitlements.js";

export type UpgradeOffer = { discountInr: number; priceInr: number };

// The Monthly -> Annual upgrade discount: most credit right after
// activating (crediting the days that would otherwise be thrown away),
// tapering linearly to ₹0 by the day they'd have renewed anyway — so
// there's no incentive to game the timing, and upgrading late costs
// nothing extra since a renewal was coming regardless.
export function getAnnualUpgradeOffer(
  entitlement: EntitlementStatus["entitlement"],
  config: PricingConfigData,
  now: Date = new Date()
): UpgradeOffer | null {
  if (!entitlement || entitlement.type !== "MONTHLY") return null;

  const dayMs = 24 * 60 * 60 * 1000;
  const remainingDays = Math.max(0, (entitlement.expiresAt.getTime() - now.getTime()) / dayMs);
  const maxDiscount = config.monthly.upgradeToAnnualMaxDiscountInr;
  const discountInr = Math.min(maxDiscount, Math.round((maxDiscount * remainingDays) / config.monthly.days));

  return { discountInr, priceInr: config.annual.priceInr - discountInr };
}

export function percentOff(originalInr: number, priceInr: number): number {
  if (originalInr <= priceInr) return 0;
  return Math.round(((originalInr - priceInr) / originalInr) * 100);
}
