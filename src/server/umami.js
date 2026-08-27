// Mirrors funnel/monetization events into Umami Cloud alongside the
// AnalyticsEvent writes in src/server/entitlements.js's logEvent — so the
// same growth/revenue questions can be explored with Umami's own
// dashboard (funnels, retention, revenue, UTM breakdown) as well as raw
// SQL via analytic.mjs. No Prisma dependency, so unlike entitlements.js
// this is safe to import directly from both server.js and Next's module
// graph (route handlers, server components) — see AGENTS.md's note on
// why entitlements.js needs a lib/ wrapper and this doesn't.
const UMAMI_HOST = "https://cloud.umami.is";
const UMAMI_WEBSITE_ID = "524c74cf-e122-4629-a2a3-a9c75790f6f8";
const UMAMI_HOSTNAME = "www.myludo.life";

// Gated to production, same as the browser tracker script in
// src/app/layout.tsx, so local dev never sends events into the real
// dashboard. Fire-and-forget: never awaited by callers, errors just log.
export async function trackUmami(name, data, userId) {
  if (process.env.NODE_ENV !== "production") return;
  try {
    const res = await fetch(`${UMAMI_HOST}/api/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Umami silently drops requests with no User-Agent header.
        "User-Agent": "myludo-server/1.0",
      },
      body: JSON.stringify({
        type: "event",
        payload: {
          website: UMAMI_WEBSITE_ID,
          hostname: UMAMI_HOSTNAME,
          url: "/",
          name,
          data,
          // Links this server-side event to the same Umami visitor
          // profile as the browser's umami.identify({ id: user.id }) call
          // (src/components/AuthProvider.tsx) — same id, so a payment
          // made via a webhook (no browser context at all) still shows up
          // on that person's timeline instead of as an anonymous event.
          ...(userId ? { id: userId } : {}),
        },
      }),
    });
    if (!res.ok) console.error(`Umami track(${name}) failed: HTTP ${res.status}`);
  } catch (err) {
    console.error(`Umami track(${name}) failed:`, err.message);
  }
}
