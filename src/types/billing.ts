export type BillingPurpose = "PACK" | "MONTHLY" | "ANNUAL";

// The shape /api/billing/status returns as JSON — same fields as
// src/lib/entitlements.ts's EntitlementStatus, but expiresAt has gone
// through JSON serialization (Date -> ISO string).
export type EntitlementStatus = {
  entitlement: { type: "MONTHLY" | "ANNUAL"; expiresAt: string } | null;
  creditsRemaining: number;
  // Latest-expiring active Game Pack credit batch, if any — see
  // src/server/entitlements.js's getEntitlementStatus().
  creditsExpireAt: string | null;
  // How many separate Game Pack purchases are currently stacked.
  creditBatchCount: number;
  freeRemaining: number;
  // Only present when entitlement is an active Monthly plan — see
  // src/lib/entitlements.ts's getAnnualUpgradeOffer().
  upgradeOffer: { discountInr: number; priceInr: number } | null;
  pricing: {
    gamePack: { priceInr: number; originalPriceInr: number; percentOff: number; credits: number; days: number };
    monthly: { priceInr: number; originalPriceInr: number; percentOff: number; days: number };
    annual: { priceInr: number; originalPriceInr: number; percentOff: number; days: number };
  };
};

export type UropaiOrderResponse = {
  orderId: string;
  amountInr: number;
  checkoutUrl: string;
};
