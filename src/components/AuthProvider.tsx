"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { useEffect } from "react";
import posthog from "posthog-js";
import { useIsAndroidApp } from "@/lib/android-app";

// Ties this browser's PostHog session to the same id server-side events use
// (src/server/posthog.js) — see posthog.com/docs/product-analytics/identify.
// Runs once per login (the effect only re-fires if the id itself changes),
// not on every page — that's the documented calling convention. Also tags
// the person with which shell they're using (android_twa vs web) so
// PostHog's own events, not just Payment-table purchases, can be split by
// acquisition channel going forward — see useIsAndroidApp()'s doc comment.
function PosthogIdentify() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const isAndroidApp = useIsAndroidApp();

  useEffect(() => {
    if (userId) {
      posthog.identify(userId);
      posthog.setPersonProperties({ platform: isAndroidApp ? "android_twa" : "web" });
    }
  }, [userId, isAndroidApp]);

  return null;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <PosthogIdentify />
      {children}
    </SessionProvider>
  );
}
