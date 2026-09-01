import { google } from "googleapis";
import { purposeForPlaySku } from "@/lib/play-products";
import type { BillingPurpose } from "@/types/billing";

// Server-only Android Publisher API client — the Play Billing counterpart
// to src/lib/uropai.ts. Uses the `googleapis` package's JWT auth rather than
// hand-rolling REST+HMAC the way uropai.ts does: Android Publisher's nested
// response types and OAuth2 service-account flow are large enough that
// hand-rolling risks subtle verification bugs in a payment-critical path.

let auth: InstanceType<typeof google.auth.GoogleAuth> | null = null;

function getAuth() {
  if (auth) return auth;
  const encoded = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64;
  if (!encoded) throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64 not configured");
  const credentials = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  return auth;
}

function packageName(): string {
  const pkg = process.env.ANDROID_PACKAGE_NAME;
  if (!pkg) throw new Error("ANDROID_PACKAGE_NAME not configured");
  return pkg;
}

function androidPublisher() {
  return google.androidpublisher({ version: "v3", auth: getAuth() });
}

export type PlayProductPurchase = {
  purchaseState: number; // 0 Purchased, 1 Canceled, 2 Pending
  orderId?: string | null;
};

export async function getProductPurchase(productId: string, purchaseToken: string): Promise<PlayProductPurchase> {
  const res = await androidPublisher().purchases.products.get({
    packageName: packageName(),
    productId,
    token: purchaseToken,
  });
  return { purchaseState: res.data.purchaseState ?? -1, orderId: res.data.orderId };
}

export async function acknowledgeProductPurchase(productId: string, purchaseToken: string): Promise<void> {
  await androidPublisher().purchases.products.acknowledge({
    packageName: packageName(),
    productId,
    token: purchaseToken,
  });
}

// Game Pack is a repeatable "consumable" one-time product, not a permanent
// unlock — Google Play treats an unconsumed managed product as still
// "owned", and refuses a second purchase of the same product with
// "You already own this item" until it's explicitly consumed. Consuming
// also implicitly acknowledges the purchase (per Play Billing's own docs),
// so this replaces acknowledgeProductPurchase for the PACK path rather than
// running alongside it — see the verify route.
export async function consumeProductPurchase(productId: string, purchaseToken: string): Promise<void> {
  await androidPublisher().purchases.products.consume({
    packageName: packageName(),
    productId,
    token: purchaseToken,
  });
}

export type PlaySubscriptionPurchase = {
  subscriptionState: string | null | undefined;
  productId: string | null; // e.g. "monthly_plan" — see mapPlayProductToPurpose. Monthly/Annual are separate top-level products, not base plans of one product — see play-products.ts.
  startTime: Date | null;
  expiryTime: Date | null;
  linkedPurchaseToken: string | null;
  orderId: string | null;
};

export async function getSubscriptionPurchaseV2(purchaseToken: string): Promise<PlaySubscriptionPurchase> {
  const res = await androidPublisher().purchases.subscriptionsv2.get({
    packageName: packageName(),
    token: purchaseToken,
  });
  const lineItem = res.data.lineItems?.[0];
  return {
    subscriptionState: res.data.subscriptionState,
    productId: lineItem?.productId ?? null,
    startTime: res.data.startTime ? new Date(res.data.startTime) : null,
    expiryTime: lineItem?.expiryTime ? new Date(lineItem.expiryTime) : null,
    linkedPurchaseToken: res.data.linkedPurchaseToken ?? null,
    orderId: lineItem?.latestSuccessfulOrderId ?? null,
  };
}

export async function acknowledgeSubscriptionPurchase(purchaseToken: string): Promise<void> {
  // subscriptionId is no longer required by this endpoint (since May 2025) —
  // omitted since it isn't needed for the base-plan model this app uses.
  await androidPublisher().purchases.subscriptions.acknowledge({
    packageName: packageName(),
    token: purchaseToken,
  });
}

// Server-trusted mapping from Play's own verified product/base-plan ID to
// our internal purpose. A client's claimed purpose is never trusted
// directly — only what Google's API itself reports for that purchase
// token, same principle as order/route.ts never trusting a client-claimed
// price.
export function mapPlayProductToPurpose(productId: string): BillingPurpose | null {
  return purposeForPlaySku(productId);
}
