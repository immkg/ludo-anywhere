"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://t.myludo.life";

// Traffic-source analytics (PostHog Cloud, myludo.life site). Gated to
// production, same as the previous Umami script tag this replaces, so
// `npm run dev` traffic doesn't pollute real visitor stats. Runs once on
// mount — React doesn't double-invoke effects in a production build, only
// under dev StrictMode, which this branch never reaches.
//
// api_host is our managed reverse proxy (t.myludo.life) so capture requests
// go first-party and dodge ad-blockers; ui_host stays on PostHog's own
// domain so the in-app toolbar/session-recording links still resolve.
export default function PosthogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
    if (process.env.NODE_ENV !== "production" || !token) return;
    posthog.init(token, {
      api_host: POSTHOG_HOST,
      ui_host: "https://us.posthog.com",
      person_profiles: "identified_only",
    });
  }, []);

  return children;
}
