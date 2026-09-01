import type { BillingPurpose } from "@/types/billing";

// Google Play product/base-plan IDs — shared between the client purchase
// call (PricingPageClient.tsx) and the server-side verification mapping
// (src/lib/play-billing.ts's mapPlayProductToPurpose), so the two can't
// drift out of sync. These must exactly match what's configured in Play
// Console (Monetize > Products) — see the project's Play Console setup
// notes for the one-time product and the two subscription base plans.
// Not secrets (they're visible in the Play Store listing itself), so
// plain constants rather than env vars — one less thing to keep in sync
// across environments for a single-app repo.
export const PLAY_PRODUCT_ID_GAME_PACK = "game_pack";
export const PLAY_SUBSCRIPTION_PRODUCT_ID = "premium_plan";
export const PLAY_BASE_PLAN_MONTHLY = "monthly";
export const PLAY_BASE_PLAN_ANNUAL = "annual";

// The full product/basePlan ID string passed to the Digital Goods API's
// PaymentRequest `sku` field, e.g. "premium_plan:monthly".
export function playSkuFor(purpose: BillingPurpose): string {
  if (purpose === "PACK") return PLAY_PRODUCT_ID_GAME_PACK;
  const basePlan = purpose === "MONTHLY" ? PLAY_BASE_PLAN_MONTHLY : PLAY_BASE_PLAN_ANNUAL;
  return `${PLAY_SUBSCRIPTION_PRODUCT_ID}:${basePlan}`;
}

// The inverse mapping, used server-side against Google's own verified
// productId in the API response — never against anything the client
// claims. See src/lib/play-billing.ts's mapPlayProductToPurpose.
export function purposeForPlaySku(productId: string): BillingPurpose | null {
  if (productId === PLAY_PRODUCT_ID_GAME_PACK) return "PACK";
  if (productId.startsWith(`${PLAY_SUBSCRIPTION_PRODUCT_ID}:`)) {
    const basePlan = productId.slice(PLAY_SUBSCRIPTION_PRODUCT_ID.length + 1);
    if (basePlan === PLAY_BASE_PLAN_MONTHLY) return "MONTHLY";
    if (basePlan === PLAY_BASE_PLAN_ANNUAL) return "ANNUAL";
  }
  return null;
}
