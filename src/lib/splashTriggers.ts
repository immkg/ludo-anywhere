// Trigger signals for the flash-discount splash (see
// src/components/game/DiscountSplash.tsx). All bookkeeping lives in
// localStorage/sessionStorage — the *display* gate (has this user already
// been shown it) is separately enforced server-side for signed-in users
// (see /api/splash/eligibility) and locally for guests; this file only
// decides *when to ask*.

export const SPLASH_TRIGGER_THRESHOLDS = {
  minSessionCount: 2, // 2nd+ visit
  minDistinctPages: 3, // "exploring the app" signal
  minMinutesPlayed: 10, // placeholder — tune from data once events exist
  minGamesCompleted: 2, // placeholder — tune from data once events exist
};

export type SplashTrigger = "session_count" | "distinct_pages" | "minutes_played" | "games_completed" | "pricing_bounce";

const SESSION_COUNT_KEY = "ludo:sessionCount";
const SESSION_SEEN_KEY = "ludo:sessionSeen"; // sessionStorage — guards the increment below to once per tab session
const DISTINCT_PAGES_KEY = "ludo:sessionPages"; // sessionStorage — Set of pathnames, this session only
const PRICING_LEFT_AT_KEY = "ludo:pricingLeftAt";
const MINUTES_PLAYED_KEY = "ludo:minutesPlayed";
const GAMES_COMPLETED_KEY = "ludo:gamesCompleted";
const GUEST_SPLASH_SHOWN_KEY = "ludo:flashSplashShown";

function readInt(key: string): number {
  if (typeof window === "undefined") return 0;
  return parseInt(localStorage.getItem(key) ?? "0", 10) || 0;
}

// Call once per app load (see RouteTracker.tsx) — increments the durable
// session counter at most once per browser tab session.
export function noteSession() {
  if (typeof window === "undefined") return;
  if (sessionStorage.getItem(SESSION_SEEN_KEY)) return;
  sessionStorage.setItem(SESSION_SEEN_KEY, "1");
  localStorage.setItem(SESSION_COUNT_KEY, String(readInt(SESSION_COUNT_KEY) + 1));
}

// Call on every route change (see RouteTracker.tsx). `/pricing` is excluded
// from the distinct-pages count — it's already its own stronger trigger
// (pricing_bounce below), so counting it here would double-fire both at
// once.
export function noteRouteVisited(pathname: string) {
  if (typeof window === "undefined") return;
  if (pathname === "/pricing") return;
  const raw = sessionStorage.getItem(DISTINCT_PAGES_KEY);
  const pages: string[] = raw ? JSON.parse(raw) : [];
  if (!pages.includes(pathname)) {
    pages.push(pathname);
    sessionStorage.setItem(DISTINCT_PAGES_KEY, JSON.stringify(pages));
  }
}

// Call when RouteTracker observes a transition *away from* /pricing —
// never on mount, so simply browsing pricing (or reloading it) never
// counts. See the plan's "fires on leaving, not while still on it".
export function notePricingLeft() {
  if (typeof window === "undefined") return;
  localStorage.setItem(PRICING_LEFT_AT_KEY, String(Date.now()));
}

export function noteGameFinished(minutesPlayed: number) {
  if (typeof window === "undefined") return;
  localStorage.setItem(MINUTES_PLAYED_KEY, String(readInt(MINUTES_PLAYED_KEY) + Math.max(0, Math.round(minutesPlayed))));
  localStorage.setItem(GAMES_COMPLETED_KEY, String(readInt(GAMES_COMPLETED_KEY) + 1));
}

export function hasGuestSeenSplash(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(GUEST_SPLASH_SHOWN_KEY) === "1";
}

export function markGuestSplashShown() {
  if (typeof window === "undefined") return;
  localStorage.setItem(GUEST_SPLASH_SHOWN_KEY, "1");
}

// First qualifying signal wins — evaluated once per game-over screen (see
// GameView.tsx). A pricing-page visit only qualifies once they've actually
// left it (notePricingLeft) without a purchase since.
export function evaluateSplashTrigger(): SplashTrigger | null {
  if (typeof window === "undefined") return null;
  if (readInt(SESSION_COUNT_KEY) >= SPLASH_TRIGGER_THRESHOLDS.minSessionCount) return "session_count";

  const pagesRaw = sessionStorage.getItem(DISTINCT_PAGES_KEY);
  const pages: string[] = pagesRaw ? JSON.parse(pagesRaw) : [];
  if (pages.length >= SPLASH_TRIGGER_THRESHOLDS.minDistinctPages) return "distinct_pages";

  if (readInt(MINUTES_PLAYED_KEY) >= SPLASH_TRIGGER_THRESHOLDS.minMinutesPlayed) return "minutes_played";
  if (readInt(GAMES_COMPLETED_KEY) >= SPLASH_TRIGGER_THRESHOLDS.minGamesCompleted) return "games_completed";
  if (localStorage.getItem(PRICING_LEFT_AT_KEY)) return "pricing_bounce";

  return null;
}
