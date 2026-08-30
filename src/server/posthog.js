// Mirrors funnel/monetization events into PostHog Cloud alongside the
// AnalyticsEvent writes in src/server/entitlements.js's logEvent — so the
// same growth/revenue questions can be explored with PostHog's own
// dashboard (funnels, retention, revenue, UTM breakdown) as well as raw
// SQL via analytic.mjs. No Prisma dependency, so unlike entitlements.js
// this is safe to import directly from both server.js and Next's module
// graph (route handlers, server components) — see AGENTS.md's note on
// why entitlements.js needs a lib/ wrapper and this doesn't.
//
// Replaces the previous Umami integration (git history has it) — switched
// because Umami Cloud gates its query API behind a paid plan, while
// PostHog's free tier (1M events/mo) includes full API access.
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
const POSTHOG_PROJECT_TOKEN = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

// Gated to production, same as the browser tracker script in
// src/app/layout.tsx, so local dev never sends events into the real
// dashboard. Fire-and-forget: never awaited by callers, errors just log.
export async function trackPosthog(name, data, userId) {
  if (process.env.NODE_ENV !== "production" || !POSTHOG_PROJECT_TOKEN) return;
  try {
    const res = await fetch(`${POSTHOG_HOST}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: POSTHOG_PROJECT_TOKEN,
        event: name,
        properties: {
          ...data,
          // Links this server-side event to the same PostHog person
          // profile as the browser's posthog.identify(userId) call
          // (src/components/AuthProvider.tsx) — same id, so a payment made
          // via a webhook (no browser context at all) still shows up on
          // that person's timeline instead of as an anonymous event. A
          // handful of callers (unauthenticated share-button taps) pass no
          // userId at all — those just collapse onto one shared
          // "anonymous" profile, which is fine since nothing downstream
          // needs to distinguish them.
          distinct_id: userId || "anonymous",
        },
      }),
    });
    if (!res.ok) console.error(`PostHog track(${name}) failed: HTTP ${res.status}`);
  } catch (err) {
    console.error(`PostHog track(${name}) failed:`, err.message);
  }
}
