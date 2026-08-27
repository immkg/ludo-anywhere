import { describe, it, expect } from "vitest";
import { getAnnualUpgradeOffer } from "./pricing";
import type { PricingConfigData, EntitlementStatus } from "../server/entitlements.js";

const CONFIG: PricingConfigData = {
  freeGamesPerDay: 2,
  gamePack: { priceInr: 9, credits: 5, expiryHours: 24, originalPriceInr: 18 },
  monthly: { priceInr: 99, days: 30, fairUseCapPerDay: 50, originalPriceInr: 198, upgradeToAnnualMaxDiscountInr: 49 },
  annual: { priceInr: 599, days: 365, fairUseCapPerDay: 50, originalPriceInr: 1198 },
  enforcementEnabled: true,
};

function monthlyEntitlement(expiresAt: Date): EntitlementStatus["entitlement"] {
  return { type: "MONTHLY", expiresAt };
}

describe("getAnnualUpgradeOffer", () => {
  it("returns null when there's no entitlement", () => {
    expect(getAnnualUpgradeOffer(null, CONFIG)).toBeNull();
  });

  it("returns null for an ANNUAL entitlement (nothing to upgrade to)", () => {
    const entitlement = { type: "ANNUAL" as const, expiresAt: new Date(Date.now() + 300 * 86400_000) };
    expect(getAnnualUpgradeOffer(entitlement, CONFIG)).toBeNull();
  });

  it("gives close to the max discount right after activation (29 of 30 days left)", () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 29 * 86400_000);
    const offer = getAnnualUpgradeOffer(monthlyEntitlement(expiresAt), CONFIG, now);
    expect(offer).toEqual({ discountInr: 47, priceInr: 552 }); // round(49 * 29/30) = 47
  });

  it("gives ~0 discount right before renewal (0 days left)", () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 1000); // effectively now
    const offer = getAnnualUpgradeOffer(monthlyEntitlement(expiresAt), CONFIG, now);
    expect(offer).toEqual({ discountInr: 0, priceInr: 599 });
  });

  it("never exceeds the configured max discount even with days remaining beyond the cycle", () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 86400_000); // shouldn't happen, but guard anyway
    const offer = getAnnualUpgradeOffer(monthlyEntitlement(expiresAt), CONFIG, now);
    expect(offer!.discountInr).toBeLessThanOrEqual(49);
  });

  it("never goes negative for an already-expired entitlement", () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() - 86400_000);
    const offer = getAnnualUpgradeOffer(monthlyEntitlement(expiresAt), CONFIG, now);
    expect(offer).toEqual({ discountInr: 0, priceInr: 599 });
  });
});
