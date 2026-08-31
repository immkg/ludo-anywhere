"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "ludo:androidApp";

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

// True only inside the Play Store app shell. The Android build ships with
// zero purchase surface (see middleware.ts's /pricing redirect) — this is
// the client-side half, hiding upgrade CTAs so there's nothing pointing
// at a purchase flow the app doesn't have.
export function useIsAndroidApp(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
