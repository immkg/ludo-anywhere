import type { BillingPurpose } from "@/types/billing";

// Google Play product IDs — shared between the client purchase call
// (PricingPageClient.tsx) and the server-side verification mapping
// (src/lib/play-billing.ts's mapPlayProductToPurpose), so the two can't
// drift out of sync. These must exactly match the Product ID configured in
// Play Console (Monetize > Products) for each product.
//
// Monthly and Annual are each their OWN subscription product (one base
// plan apiece), not two base plans on a single product. The TWA's Play
// Billing bridge (androidbrowserhelper's PlayBillingWrapper) looks products
// up by exact product ID and always purchases whichever base plan Play
// returns first for that product — there is no supported way to select a
// specific base plan when a product has more than one, confirmed against
// the library's actual source (queryProductDetails is called with the raw
// sku string as the product ID; launchPaymentFlow always takes
// offerDetails.get(0)). A single product with two base plans is a real
// Play Console feature, but not reachable through this integration.
export const PLAY_PRODUCT_ID_GAME_PACK = "game_pack";
export const PLAY_PRODUCT_ID_MONTHLY = "monthly_plan";
export const PLAY_PRODUCT_ID_ANNUAL = "annual_plan";

// The product ID passed to the Digital Goods API's PaymentRequest `sku`
// field.
export function playSkuFor(purpose: BillingPurpose): string {
  if (purpose === "PACK") return PLAY_PRODUCT_ID_GAME_PACK;
  return purpose === "MONTHLY" ? PLAY_PRODUCT_ID_MONTHLY : PLAY_PRODUCT_ID_ANNUAL;
}

// The inverse mapping, used server-side against Google's own verified
// productId in the API response — never against anything the client
// claims. See src/lib/play-billing.ts's mapPlayProductToPurpose.
export function purposeForPlaySku(productId: string): BillingPurpose | null {
  if (productId === PLAY_PRODUCT_ID_GAME_PACK) return "PACK";
  if (productId === PLAY_PRODUCT_ID_MONTHLY) return "MONTHLY";
  if (productId === PLAY_PRODUCT_ID_ANNUAL) return "ANNUAL";
  return null;
}
