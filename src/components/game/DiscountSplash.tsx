"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import posthog from "posthog-js";
import type { EntitlementStatus, BillingPurpose } from "@/types/billing";
import { IconGift } from "@/components/pricing/icons";
import { IconLightning } from "@/components/home/icons";
import type { SplashTrigger } from "@/lib/splashTriggers";
import { useIsAndroidApp } from "@/lib/android-app";

type FlashPlan = Extract<BillingPurpose, "PACK" | "MONTHLY">;

// Mirrors prisma/seed-campaigns.mjs's flash_game_pack/flash_monthly
// discountInr — the order route (src/app/api/billing/uropai/order/route.ts)
// is the real source of truth for what gets charged; this is only for
// displaying the drop before a coupon exists to read it from.
const FLASH_DISCOUNT_INR: Record<FlashPlan, number> = { PACK: 16, MONTHLY: 50 };
const COUNTDOWN_SECONDS = 5 * 60;

// Same per-plan colors as PricingPageClient's PLAN_META, so a plan reads as
// the same object whether it's met here or on /pricing right after —
// update both if this palette ever changes.
const PLAN_COLOR: Record<FlashPlan, string> = { PACK: "#E8720C", MONTHLY: "#2563EB" };
// The four Ludo token colors (src/game/board.js's ARM_COLORS) — the one
// borrowed-from-the-board flourish this splash gets, kept small and
// singular rather than spread across the whole thing.
const TOKEN_COLORS = ["#E8262C", "#1F9E4C", "#FFCC00", "#1565E8"];

type DiscountSplashProps = {
  trigger: SplashTrigger;
  isSignedIn: boolean;
  onClose: () => void;
};

// /api/billing/status also returns this same shape, but requires a
// session — /api/pricing is the public equivalent, since guests need to see
// prices on the splash before ever signing in.
async function fetchPricing(): Promise<EntitlementStatus["pricing"] | null> {
  const res = await fetch("/api/pricing");
  if (!res.ok) return null;
  return res.json();
}

export default function DiscountSplash({ trigger, isSignedIn, onClose }: DiscountSplashProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [pricing, setPricing] = useState<EntitlementStatus["pricing"] | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [claiming, setClaiming] = useState<FlashPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closedRef = useRef(false);
  // Android ships flat Play Billing pricing only (see PricingPageClient.tsx)
  // — no flash discount, no coupon, no time-limited framing. This splash
  // still opens (it's also a re-engagement nudge, not just a discount
  // pitch), but shows the same flat price /pricing does and its CTA just
  // sends the user there instead of claiming a coupon that doesn't apply
  // on this platform.
  const isAndroidApp = useIsAndroidApp();

  useEffect(() => {
    fetchPricing().then(setPricing);
    posthog.capture("flash_splash_shown", { trigger });
  }, [trigger]);

  const close = (reason: "dismissed" | "expired") => {
    if (closedRef.current) return;
    closedRef.current = true;
    posthog.capture("flash_splash_dismissed", { trigger, reason });
    onClose();
  };

  useEffect(() => {
    // No countdown on Android — there's no discount to expire, so a ticking
    // timer would just be misleading urgency theater. The splash stays open
    // until the user dismisses it or taps a plan.
    if (isAndroidApp) return;
    if (secondsLeft <= 0) {
      close("expired");
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close() reads closedRef, not secondsLeft; re-running per tick is intentional
  }, [secondsLeft, isAndroidApp]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close("dismissed");
    }
    document.addEventListener("keydown", onKeyDown);
    sheetRef.current?.querySelector<HTMLElement>("button")?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: sets up the Escape handler and initial focus once
  }, []);

  // Android has no coupon to claim — just send them to /pricing, where the
  // actual Play Billing purchase happens (see PricingPageClient.tsx). Same
  // destination whether they're signed in or not: a guest lands on
  // /pricing and signs in there like any other visitor, since there's no
  // flash-offer identity to preserve across that hop anymore.
  const handleAndroidBuy = (plan: FlashPlan) => {
    posthog.capture("flash_splash_claim_clicked", { trigger, plan });
    closedRef.current = true; // navigating away — not a "dismissed" close
    router.push("/pricing");
  };

  const handleClaim = async (plan: FlashPlan) => {
    posthog.capture("flash_splash_claim_clicked", { trigger, plan });
    setClaiming(plan);
    setError(null);
    try {
      const res = await fetch("/api/coupons/claim-flash-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) throw new Error("Could not claim this offer");
      closedRef.current = true; // navigating away — not a "dismissed" close
      router.push("/pricing?promo=flash");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not claim this offer");
      setClaiming(null);
    }
  };

  const handleSignIn = (plan: FlashPlan) => {
    posthog.capture("flash_splash_signin_clicked", { trigger, plan });
    closedRef.current = true; // navigating away — not a "dismissed" close
    signIn("google", { callbackUrl: `/pricing?promo=flash&claim=1&plan=${plan}` });
  };

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const urgent = secondsLeft <= 60;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-30 flex items-center justify-center bg-black/55 p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={reduceMotion ? { duration: 0 } : undefined}
        onClick={() => close("dismissed")}
        aria-hidden={false}
      >
        <motion.div
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-label={isAndroidApp ? "Get more games" : "Limited-time discount"}
          onClick={(e) => e.stopPropagation()}
          // Matches the backdrop's own p-4 (1rem top + 1rem bottom) so the
          // card gets the full height that still leaves equal margins,
          // rather than an arbitrary fraction that clips content sooner
          // than the viewport actually requires. overflow-y-auto (not just
          // overflow-hidden) only kicks in a scrollbar on genuinely short
          // viewports, and still clips the gradient header's square
          // corners against the rounded container the same as
          // overflow-hidden did at rest.
          className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-y-auto rounded-3xl bg-surface shadow-2xl"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
          transition={reduceMotion ? { duration: 0 } : { type: "spring", damping: 22, stiffness: 300 }}
        >
          {/* Header: the one bold gesture — a warm sunset gradient (the
              app's own accent/accent-2 pair) standing in for "hot deal",
              with the countdown chip pinned so it straddles the seam into
              the body below, like a badge pinned to a ticket. */}
          <div
            className="relative flex flex-col gap-0.5 px-5 pb-5 pt-4 text-white sm:gap-1 sm:px-6 sm:pb-7 sm:pt-5"
            style={{ background: "linear-gradient(135deg, var(--color-accent), var(--color-accent-2))" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-1.5" aria-hidden>
                {TOKEN_COLORS.map((c) => (
                  <span key={c} className="h-2 w-2 rounded-full" style={{ background: c }} />
                ))}
              </div>
              <button
                onClick={() => close("dismissed")}
                aria-label="Close"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25"
              >
                ✕
              </button>
            </div>
            {isAndroidApp ? (
              <>
                <p className="text-lg font-extrabold sm:text-xl">🎲 Keep the games going</p>
                <p className="text-xs text-white/85 sm:text-sm">Grab a Game Pack or Game Pass anytime.</p>
              </>
            ) : (
              <>
                <p className="text-lg font-extrabold sm:text-xl">🎲 A deal, just for you</p>
                <p className="text-xs text-white/85 sm:text-sm">This price disappears when the timer hits 0.</p>
              </>
            )}
          </div>

          {!isAndroidApp && (
            <div className="flex justify-center">
              <motion.div
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={reduceMotion ? { duration: 0 } : { type: "spring", damping: 14, stiffness: 260, delay: 0.15 }}
                className="relative -mt-3 flex items-center gap-1.5 rounded-2xl border-2 bg-surface px-3 py-1 shadow-lg sm:-mt-4 sm:px-3.5 sm:py-1.5"
                style={{ borderColor: urgent ? "#E8262C" : "var(--color-accent)" }}
              >
                <motion.span
                  aria-hidden
                  animate={reduceMotion || !urgent ? undefined : { scale: [1, 1.15, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  ⏱
                </motion.span>
                <span
                  className="text-sm font-extrabold tabular-nums sm:text-base"
                  style={{ color: urgent ? "#E8262C" : "var(--color-accent)" }}
                >
                  {minutes}:{String(seconds).padStart(2, "0")}
                </span>
              </motion.div>
            </div>
          )}

          <div className="mx-5 mt-2 border-t border-dashed border-line sm:mx-6 sm:mt-3" />

          <div className="flex flex-col gap-2.5 p-4 pt-3 sm:gap-3 sm:p-6 sm:pt-4">
            {!pricing ? (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
                <div className="h-40 animate-pulse rounded-2xl bg-surface-2 sm:h-48" aria-hidden />
                <div className="h-40 animate-pulse rounded-2xl bg-surface-2 sm:h-48" aria-hidden />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
                <FlashPlanCard
                  plan="PACK"
                  name="GAME PACK"
                  Icon={IconGift}
                  subtitle={`${pricing.gamePack.credits} games · ${pricing.gamePack.days} days`}
                  originalPriceInr={pricing.gamePack.originalPriceInr}
                  regularPriceInr={pricing.gamePack.priceInr}
                  // No flash reduction on Android — flashPriceInr just
                  // equals the flat price, same number /pricing shows.
                  flashPriceInr={Math.max(0, pricing.gamePack.priceInr - (isAndroidApp ? 0 : FLASH_DISCOUNT_INR.PACK))}
                  isSignedIn={isSignedIn}
                  loading={claiming === "PACK"}
                  onClaim={isAndroidApp ? () => handleAndroidBuy("PACK") : () => handleClaim("PACK")}
                  onSignIn={() => handleSignIn("PACK")}
                  androidMode={isAndroidApp}
                  androidCtaLabel="Get Game Pack"
                />
                <FlashPlanCard
                  plan="MONTHLY"
                  name="GAME PASS"
                  Icon={IconLightning}
                  subtitle={`Unlimited games · ${pricing.monthly.days} days`}
                  originalPriceInr={pricing.monthly.originalPriceInr}
                  regularPriceInr={pricing.monthly.priceInr}
                  flashPriceInr={Math.max(0, pricing.monthly.priceInr - (isAndroidApp ? 0 : FLASH_DISCOUNT_INR.MONTHLY))}
                  isSignedIn={isSignedIn}
                  loading={claiming === "MONTHLY"}
                  onClaim={isAndroidApp ? () => handleAndroidBuy("MONTHLY") : () => handleClaim("MONTHLY")}
                  onSignIn={() => handleSignIn("MONTHLY")}
                  androidMode={isAndroidApp}
                  androidCtaLabel="Get Game Pass"
                  highlight
                />
              </div>
            )}

            {error && <p className="text-sm text-accent">{error}</p>}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function FlashPlanCard({
  name,
  Icon,
  subtitle,
  originalPriceInr,
  regularPriceInr,
  flashPriceInr,
  isSignedIn,
  loading,
  onClaim,
  onSignIn,
  highlight,
  plan,
  androidMode,
  androidCtaLabel,
}: {
  plan: FlashPlan;
  name: string;
  Icon: (props: { className?: string }) => React.ReactElement;
  subtitle: string;
  originalPriceInr: number;
  regularPriceInr: number;
  flashPriceInr: number;
  isSignedIn: boolean;
  loading: boolean;
  onClaim: () => void;
  onSignIn: () => void;
  highlight?: boolean;
  // Android: no discount, so the card shows the same flat price /pricing
  // does (originalPriceInr struck through -> flashPriceInr, which equals
  // regularPriceInr here — see the call sites above), and the button
  // always calls onClaim (which the caller wires to a plain /pricing
  // navigation, not a coupon claim) regardless of sign-in state.
  androidMode?: boolean;
  androidCtaLabel?: string;
}) {
  const color = PLAN_COLOR[plan];
  return (
    <div
      // pt- headroom is unconditional (not just on the highlighted card) so
      // both cards' icon+name rows start at the same y — the ribbon below
      // floats in that reserved space on whichever card has one, instead of
      // shifting only that card's content down and knocking the two cards
      // out of line with each other.
      className="relative flex flex-col items-center gap-1.5 rounded-2xl bg-surface-2 p-3 pt-5 text-center sm:gap-2 sm:p-4 sm:pt-6"
      style={highlight ? { boxShadow: `inset 0 0 0 2px ${color}` } : undefined}
    >
      {highlight && (
        <span
          className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm"
          style={{ background: color }}
        >
          🏆 BEST VALUE
        </span>
      )}
      <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 sm:gap-x-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full sm:h-9 sm:w-9"
          style={{ background: `${color}1a`, color }}
        >
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </span>
        {/* leading-none — default line-height pads extra space above/below
            the glyphs, which is what actually makes bold text look
            vertically off-center next to an icon even though items-center
            geometrically centers both boxes correctly. */}
        <p className="text-sm font-extrabold leading-none text-ink sm:text-base">{name}</p>
      </div>
      <p className="text-xs text-ink-muted">{subtitle}</p>
      {/* Strikethrough ladder + "Save ₹X" on one line — that line shows
          *that* the price dropped and *how much* together, so nobody has
          to subtract two struck-through numbers themselves. The flash
          price then gets its own line: big, gradient-filled, unmissable.
          On Android, flashPriceInr === regularPriceInr (no flash
          reduction), so the regularPriceInr line is skipped — otherwise
          it'd show the exact same number struck through immediately above
          the identical big price, which reads as a bug, not a deal. */}
      <div className="flex flex-wrap items-baseline justify-center gap-x-1.5 gap-y-0.5">
        <span className="text-xs text-ink-muted line-through opacity-60">₹{originalPriceInr}</span>
        {!androidMode && (
          <span className="text-sm font-semibold text-ink-muted line-through">₹{regularPriceInr}</span>
        )}
        {/* Plain colored text, not another pill — the button below is the
            only chip in this card that should read as "solid and pressable". */}
        <span className="text-xs font-bold" style={{ color }}>
          Save ₹{originalPriceInr - flashPriceInr} · {Math.round(((originalPriceInr - flashPriceInr) / originalPriceInr) * 100)}% off
        </span>
      </div>
      <p
        className="-mb-0.5 bg-clip-text text-2xl font-extrabold text-transparent sm:text-3xl"
        style={{ backgroundImage: "linear-gradient(135deg, var(--color-accent), var(--color-accent-2))" }}
      >
        ₹{flashPriceInr}
      </p>
      <button
        onClick={androidMode ? onClaim : isSignedIn ? onClaim : onSignIn}
        disabled={loading}
        // mt-auto — grid stretches both cards to equal height already
        // (default align-items: stretch); this is what actually pushes the
        // button down to that shared bottom edge instead of sitting right
        // under whatever content happens to be shorter on one side.
        className="mt-auto w-full min-h-10 rounded-full px-2 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none sm:min-h-11"
        style={{ background: color }}
      >
        {androidMode ? (androidCtaLabel ?? "Get this plan") : loading ? "Claiming…" : isSignedIn ? "Get this price" : "Sign in to claim this price"}
      </button>
    </div>
  );
}
