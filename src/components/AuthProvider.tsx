"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { useEffect } from "react";
import posthog from "posthog-js";

// Ties this browser's PostHog session to the same id server-side events use
// (src/server/posthog.js) — see posthog.com/docs/product-analytics/identify.
// Runs once per login (the effect only re-fires if the id itself changes),
// not on every page — that's the documented calling convention.
function PosthogIdentify() {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  useEffect(() => {
    if (userId) posthog.identify(userId);
  }, [userId]);

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
