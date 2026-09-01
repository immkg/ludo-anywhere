"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const STORAGE_KEY = "ludo:androidApp";

// The Digital Goods API's own minimal purchase-details shape — not part of
// TypeScript's lib.dom.d.ts yet, so declared locally. Only the fields this
// app actually reads.
type DigitalGoodsService = {
  getDetails(itemIds: string[]): Promise<Array<{ itemId: string; price: { currency: string; value: string } }>>;
};

declare global {
  interface Window {
    getDigitalGoodsService?: (paymentMethod: string) => Promise<DigitalGoodsService>;
  }
}

// A TWA (Trusted Web Activity) launch sets document.referrer to
// "android-app://<package>" on its first navigation — see
// https://developer.chrome.com/docs/android/trusted-web-activity/. That's
// only present on cold start, not on later client-side route changes, so
// it's cached in localStorage the first time it's seen.
function getSnapshot(): boolean {
  try {
    if (document.referrer.startsWith("android-app://")) {
      localStorage.setItem(STORAGE_KEY, "1");
      return true;
    }
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(): () => void {
  return () => {};
}

// True only inside the Play Store app shell. Purchases on Android go
// through Google Play Billing instead of Uropai — see
// usePlayDigitalGoodsService() below and src/components/pricing/PricingPageClient.tsx.
export function useIsAndroidApp(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// Whether this exact page load can actually make a Play Billing purchase —
// distinct from useIsAndroidApp() above. Google Play Billing on a TWA
// requires the installed app build to have been packaged with billing
// support enabled (see the project's Play Console setup notes); an older
// app build, or a browser tab with a spoofed android-app:// referrer, is
// "Android" by the check above but has no getDigitalGoodsService at all.
// Deliberately NOT cached in localStorage the way useIsAndroidApp() is —
// this must reflect the current app build's real capability every load,
// not a stale "yes" from before the user's app was downgraded/reinstalled.
export function usePlayDigitalGoodsService(): "loading" | DigitalGoodsService | null {
  const [service, setService] = useState<"loading" | DigitalGoodsService | null>("loading");

  useEffect(() => {
    let cancelled = false;
    const getService = window.getDigitalGoodsService?.("https://play.google.com/billing") ?? Promise.reject();
    getService
      .then((s) => {
        if (!cancelled) setService(s);
      })
      .catch(() => {
        if (!cancelled) setService(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return service;
}
