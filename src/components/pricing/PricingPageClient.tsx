"use client";

import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { BillingPurpose, EntitlementStatus } from "@/types/billing";
import { cn } from "@/lib/utils";
import { IconCheck, IconCrown, IconUsers } from "@/components/lobby/icons";
import { IconLightning } from "@/components/home/icons";
import { IconGift, IconSprout, IconLock } from "@/components/pricing/icons";
import { useIsAndroidApp, usePlayDigitalGoodsService } from "@/lib/android-app";
import { playSkuFor } from "@/lib/play-products";

// On the web, these are one-time purchases, not subscriptions — no
// cancellation, no recurring billing, and the copy/states below are built
// around expiry. On Android, MONTHLY/ANNUAL purchase through Google Play
// Billing instead (see the buy() branch below), where they DO auto-renew
// natively and are managed/cancelled from Play's own subscription center
// (required by Play policy — this app doesn't build its own cancel UI for
// that path). "MONTHLY"/"ANNUAL"/"PACK" below are the existing backend
// entitlement/purpose identifiers (src/types/billing.ts); only their
// customer-facing names change here.
type PlanKey = "FREE" | "PACK" | "MONTHLY" | "ANNUAL";

type PlanMeta = { name: string; color: string; Icon: ComponentType<{ className?: string }> };

const PLAN_META: Record<PlanKey, PlanMeta> = {
  FREE: { name: "FREE", color: "#1F9254", Icon: IconSprout },
  PACK: { name: "GAME PACK", color: "#E8720C", Icon: IconGift },
  MONTHLY: { name: "GAME PASS", color: "#2563EB", Icon: IconLightning },
  ANNUAL: { name: "GAME PASS ANNUAL", color: "#7C3AED", Icon: IconCrown },
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: sameYear ? undefined : "numeric" });
}

async function fetchStatus(): Promise<EntitlementStatus | null> {
  const res = await fetch("/api/billing/status");
  if (!res.ok) return null;
  return res.json();
}

type ActiveCoupon = {
  id: string;
  expiresAt: string | null;
  campaign: { discountPercent: number; discountInr: number | null; restrictToPurpose: string | null; kind: string };
};

async function fetchActiveCoupon(): Promise<ActiveCoupon | null> {
  const res = await fetch("/api/coupons/active");
  if (!res.ok) return null;
  const data = await res.json();
  return data.coupon ?? null;
}

function couponAppliesTo(coupon: ActiveCoupon, purpose: BillingPurpose): boolean {
  return !coupon.campaign.restrictToPurpose || coupon.campaign.restrictToPurpose === purpose;
}

// Mirrors the order route's own discount math (see
// src/app/api/billing/uropai/order/route.ts) purely for display — the
// server always recomputes this itself from the coupon it looks up, never
// trusting anything the client sends.
function previewDiscountedPrice(basePriceInr: number, coupon: ActiveCoupon): number {
  const discountInr = coupon.campaign.discountInr ?? Math.round((basePriceInr * coupon.campaign.discountPercent) / 100);
  return Math.max(0, basePriceInr - discountInr);
}

export default function PricingPageClient() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const processing = searchParams.get("status") === "processing";
  const isAndroidApp = useIsAndroidApp();
  const digitalGoodsService = usePlayDigitalGoodsService();
  // True once we know Android billing genuinely isn't available on this
  // exact app build (not while still checking) — see
  // usePlayDigitalGoodsService()'s comment for why an old build or a
  // spoofed android-app:// referrer must not show a broken buy button.
  const androidBillingUnavailable = isAndroidApp && digitalGoodsService === null;

  const [status, setStatus] = useState<EntitlementStatus | null>(null);
  const [buying, setBuying] = useState<BillingPurpose | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelayed, setConfirmDelayed] = useState(false);

  // See CouponBar's comment below for when this starts checked vs.
  // unchecked.
  const [coupon, setCoupon] = useState<ActiveCoupon | null>(null);
  const [applyCoupon, setApplyCoupon] = useState(false);

  // ?promo=flash arrives from DiscountSplash (src/components/game/DiscountSplash.tsx)
  // — a signed-in claim already issued the coupon before redirecting here,
  // so it just needs picking up and pre-checking. ?claim=1&plan=... is the
  // guest path: they signed in from the splash without a coupon yet (guests
  // can't own one), so it's claimed here instead, the moment they're
  // identified — see the plan doc's "Guest flow".
  useEffect(() => {
    fetchStatus().then(setStatus);
    const promo = searchParams.get("promo");
    const claimPlan = searchParams.get("claim") === "1" ? searchParams.get("plan") : null;
    if (promo === "flash" && claimPlan) {
      fetch("/api/coupons/claim-flash-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: claimPlan }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { coupon?: ActiveCoupon } | null) => {
          if (data?.coupon) {
            setCoupon(data.coupon);
            setApplyCoupon(true);
          }
        })
        .catch(() => {});
      return;
    }
    fetchActiveCoupon().then((c) => {
      setCoupon(c);
      if (promo === "flash" && c) setApplyCoupon(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount against the URL params present at load, same as the effect this replaces
  }, []);

  // While "processing", the user has been redirected back from Uropai's
  // hosted checkout — we're just waiting for /api/billing/status to
  // reconcile the order and grant the entitlement. Uropai's webhook has
  // been observed taking 30-40s to actually arrive (their TEST environment
  // settles through a real underlying gateway sandbox), so this polls for
  // up to 2 minutes rather than giving up after a few seconds — stopping
  // early as soon as credits/entitlement actually change from what they
  // were right before checkout.
  useEffect(() => {
    if (!processing) return;
    const baseline = status;
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts += 1;
      const next = await fetchStatus();
      if (next) setStatus(next);
      const changed =
        next &&
        baseline &&
        (next.creditsRemaining !== baseline.creditsRemaining || next.entitlement?.expiresAt !== baseline.entitlement?.expiresAt);
      if (changed || attempts >= 40) {
        clearInterval(interval);
        if (!changed) setConfirmDelayed(true);
        router.replace("/pricing");
      }
    }, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- baseline is captured once when processing starts, not re-read every render
  }, [processing, router]);

  const buyOnAndroid = useCallback(
    async (purpose: BillingPurpose) => {
      const sku = playSkuFor(purpose);
      const request = new PaymentRequest(
        [{ supportedMethods: "https://play.google.com/billing", data: { sku } }],
        { total: { label: "Total", amount: { currency: "INR", value: "0" } } }
      );
      const response = await request.show();
      const purchaseToken = (response.details as { purchaseToken?: string } | null)?.purchaseToken;
      if (!purchaseToken) {
        await response.complete("fail");
        throw new Error("No purchase token returned");
      }
      const res = await fetch("/api/billing/play/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseToken, productId: sku }),
      });
      if (!res.ok) {
        await response.complete("fail");
        throw new Error("Could not verify purchase");
      }
      await response.complete("success");
      const next = await fetchStatus();
      if (next) setStatus(next);
    },
    []
  );

  const buy = useCallback(
    async (purpose: BillingPurpose) => {
      if (!session?.user) return;
      if (androidBillingUnavailable) {
        setError("Update the app from Play Store to purchase.");
        return;
      }
      setBuying(purpose);
      setError(null);
      try {
        if (isAndroidApp && digitalGoodsService && digitalGoodsService !== "loading") {
          await buyOnAndroid(purpose);
          setBuying(null);
          return;
        }

        const res = await fetch("/api/billing/uropai/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purpose, applyCoupon: applyCoupon && !!coupon }),
        });
        if (!res.ok) throw new Error("Could not start checkout");
        const order = await res.json();
        // Uropai's checkout is a hosted redirect page, not an in-page
        // modal — the user lands back on /pricing?status=processing (set
        // as the order's returnUrl) once they're done there.
        window.location.href = order.checkoutUrl;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start checkout");
        setBuying(null);
      }
    },
    [session, applyCoupon, coupon, isAndroidApp, digitalGoodsService, androidBillingUnavailable, buyOnAndroid]
  );

  const planType = status?.entitlement?.type ?? null;
  const hasPack = (status?.creditsRemaining ?? 0) > 0;

  // Flash-coupon preview prices for the Game Pack / Game Pass cards below —
  // undefined unless the checkbox is checked and the active coupon is
  // actually usable against that plan (see couponAppliesTo above). Never
  // shown on Android — v1 ships flat Play Billing prices only, see the
  // top-of-file comment.
  const flashPackPriceInr =
    status && !isAndroidApp && applyCoupon && coupon && couponAppliesTo(coupon, "PACK")
      ? previewDiscountedPrice(status.pricing.gamePack.priceInr, coupon)
      : undefined;
  const flashMonthlyPriceInr =
    status && !isAndroidApp && applyCoupon && coupon && couponAppliesTo(coupon, "MONTHLY")
      ? previewDiscountedPrice(status.pricing.monthly.priceInr, coupon)
      : undefined;

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-6 px-4 pb-10 pt-6 sm:gap-7 sm:px-6 sm:pt-8 lg:px-10 lg:pt-10">
      {processing && (
        <p className="rounded-2xl border border-line bg-surface-2 p-3 text-sm text-ink-muted">Confirming your payment…</p>
      )}
      {confirmDelayed && (
        <p className="rounded-2xl border border-line bg-surface-2 p-3 text-sm text-ink-muted">
          Still confirming your payment — this can take a minute. Refresh in a bit if it doesn&apos;t show up here.
        </p>
      )}
      {error && <p className="text-sm text-accent">{error}</p>}
      {androidBillingUnavailable && (
        <p className="rounded-2xl border border-line bg-surface-2 p-3 text-sm text-ink-muted">
          This app version can&apos;t process purchases yet — update MyLudo from the Play Store to buy a Game Pack or
          Game Pass.
        </p>
      )}

      {!isAndroidApp && (
        <CouponBar
          coupon={coupon}
          applyCoupon={applyCoupon}
          onToggle={setApplyCoupon}
          onRedeemed={setCoupon}
        />
      )}

      {!status ? (
        <LoadingSkeleton />
      ) : planType === "ANNUAL" ? (
        <YourPlanSection>
          <ActivePlanCard
            planKey="ANNUAL"
            subtitle={`Unlimited games · ${status.pricing.annual.days} days`}
            validUntil={formatDate(status.entitlement!.expiresAt)}
          />
          <p className="text-sm text-ink-muted">
            You&apos;re all set. Enjoy unlimited games until {formatDate(status.entitlement!.expiresAt)}.
          </p>
        </YourPlanSection>
      ) : planType === "MONTHLY" ? (
        <>
          <YourPlanSection>
            <ActivePlanCard
              planKey="MONTHLY"
              subtitle={`Unlimited games · ${status.pricing.monthly.days} days`}
              validUntil={formatDate(status.entitlement!.expiresAt)}
            />
          </YourPlanSection>
          {status.upgradeOffer && (
            <PlanGroup heading="GET MORE">
              <PlanCard
                planKey="ANNUAL"
                subtitle={`Unlimited games · ${status.pricing.annual.days} days`}
                price={`₹${status.upgradeOffer.priceInr}`}
                note={
                  status.upgradeOffer.discountInr > 0
                    ? `Includes ₹${status.upgradeOffer.discountInr} credit for your remaining Game Pass days`
                    : "One-time purchase"
                }
                benefits={["Unlimited games", "Any player count", "Play with friends", `Valid for ${status.pricing.annual.days} days`]}
                ctaLabel="Upgrade to Annual Pass"
                loading={buying === "ANNUAL"}
                onBuy={() => buy("ANNUAL")}
                highlight
              />
            </PlanGroup>
          )}
        </>
      ) : hasPack ? (
        <>
          <YourPlanSection>
            <ActivePlanCard
              planKey="PACK"
              subtitle={`${status.pricing.gamePack.credits} games · ${status.pricing.gamePack.days} days`}
              detail={`${status.creditsRemaining} game${status.creditsRemaining === 1 ? "" : "s"} remaining`}
              validUntil={status.creditsExpireAt ? formatDate(status.creditsExpireAt) : undefined}
            />
          </YourPlanSection>
          <PlanGroup heading="GET MORE GAMES">
            <PlanCard
              planKey="PACK"
              subtitle={`${status.pricing.gamePack.credits} games · ${status.pricing.gamePack.days} days`}
              price={`₹${status.pricing.gamePack.priceInr}`}
              original={status.pricing.gamePack.originalPriceInr}
              percentOff={status.pricing.gamePack.percentOff}
              discountedPriceInr={flashPackPriceInr}
              benefits={[`${status.pricing.gamePack.credits} games`, "Any player count", `Valid for ${status.pricing.gamePack.days} days`]}
              ctaLabel="Buy Another Pack"
              loading={buying === "PACK"}
              onBuy={() => buy("PACK")}
            />
            <PlanCard
              planKey="ANNUAL"
              subtitle={`Unlimited games · ${status.pricing.annual.days} days`}
              price={`₹${status.pricing.annual.priceInr}`}
              original={status.pricing.annual.originalPriceInr}
              percentOff={status.pricing.annual.percentOff}
              benefits={[
                "Unlimited games",
                "Any player count",
                "Play with friends",
                `Valid for ${status.pricing.annual.days} days`,
                "Best value",
              ]}
              ctaLabel="Buy Annual Pass"
              loading={buying === "ANNUAL"}
              onBuy={() => buy("ANNUAL")}
              highlight
            />
            <PlanCard
              planKey="MONTHLY"
              subtitle={`Unlimited games · ${status.pricing.monthly.days} days`}
              price={`₹${status.pricing.monthly.priceInr}`}
              original={status.pricing.monthly.originalPriceInr}
              percentOff={status.pricing.monthly.percentOff}
              discountedPriceInr={flashMonthlyPriceInr}
              benefits={["Unlimited games", "Any player count", "Play with friends", `Valid for ${status.pricing.monthly.days} days`]}
              ctaLabel="Buy Game Pass"
              loading={buying === "MONTHLY"}
              onBuy={() => buy("MONTHLY")}
            />
          </PlanGroup>
        </>
      ) : (
        <>
          <YourPlanSection heading="CURRENT PLAN">
            <ActivePlanCard planKey="FREE" subtitle="2 games every day" note="Always free" badge={null} />
          </YourPlanSection>
          <PlanGroup heading="GET MORE GAMES">
            <PlanCard
              planKey="PACK"
              subtitle={`${status.pricing.gamePack.credits} games · ${status.pricing.gamePack.days} days`}
              price={`₹${status.pricing.gamePack.priceInr}`}
              original={status.pricing.gamePack.originalPriceInr}
              percentOff={status.pricing.gamePack.percentOff}
              discountedPriceInr={flashPackPriceInr}
              benefits={[`${status.pricing.gamePack.credits} games`, "Any player count", `Valid for ${status.pricing.gamePack.days} days`]}
              ctaLabel="Buy Game Pack"
              loading={buying === "PACK"}
              onBuy={() => buy("PACK")}
            />
            <PlanCard
              planKey="ANNUAL"
              subtitle={`Unlimited games · ${status.pricing.annual.days} days`}
              price={`₹${status.pricing.annual.priceInr}`}
              original={status.pricing.annual.originalPriceInr}
              percentOff={status.pricing.annual.percentOff}
              benefits={[
                "Unlimited games",
                "Any player count",
                "Play with friends",
                `Valid for ${status.pricing.annual.days} days`,
                "Best value",
              ]}
              ctaLabel="Buy Annual Pass"
              loading={buying === "ANNUAL"}
              onBuy={() => buy("ANNUAL")}
              highlight
            />
            <PlanCard
              planKey="MONTHLY"
              subtitle={`Unlimited games · ${status.pricing.monthly.days} days`}
              price={`₹${status.pricing.monthly.priceInr}`}
              original={status.pricing.monthly.originalPriceInr}
              percentOff={status.pricing.monthly.percentOff}
              discountedPriceInr={flashMonthlyPriceInr}
              benefits={["Unlimited games", "Any player count", "Play with friends", `Valid for ${status.pricing.monthly.days} days`]}
              ctaLabel="Buy Game Pass"
              loading={buying === "MONTHLY"}
              onBuy={() => buy("MONTHLY")}
            />
          </PlanGroup>
        </>
      )}

      <HostBenefitBanner />

      <PaymentFooter isAndroidApp={isAndroidApp} />
    </main>
  );
}

function HostBenefitBanner() {
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-accent/30 bg-accent/10 p-4 sm:p-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent/20 text-accent">
        <IconUsers className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-extrabold text-ink sm:text-base">
          Host on a paid plan, everyone who joins your game plays free.
        </p>
        <p className="text-xs text-ink-muted sm:text-sm">One person pays. Everyone at the table plays.</p>
      </div>
    </div>
  );
}

// Never auto-applies an organically-redeemed coupon — even one the user
// already holds starts unchecked, and redeeming a new code doesn't check
// it either. See src/lib/coupons.ts for why: a referred user picking a
// *different* coupon here is exactly what forfeits their referrer's
// reward, so it can't be something that just happens by default. The one
// exception is arriving via ?promo=flash from DiscountSplash — the user
// already made an explicit choice by tapping a specific plan there, so
// the checkbox starts pre-checked (still visible and toggleable) instead
// of asking them to repeat that choice.
function CouponBar({
  coupon,
  applyCoupon,
  onToggle,
  onRedeemed,
}: {
  coupon: ActiveCoupon | null;
  applyCoupon: boolean;
  onToggle: (v: boolean) => void;
  onRedeemed: (coupon: ActiveCoupon) => void;
}) {
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  const redeem = async () => {
    if (!code.trim()) return;
    setRedeeming(true);
    setRedeemError(null);
    try {
      const res = await fetch("/api/coupons/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "That code isn't valid");
      onRedeemed(data.coupon);
      setCode("");
    } catch (e) {
      setRedeemError(e instanceof Error ? e.message : "That code isn't valid");
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      {coupon ? (
        <label className="flex min-h-11 flex-wrap items-center gap-3 text-sm">
          <input type="checkbox" checked={applyCoupon} onChange={(e) => onToggle(e.target.checked)} className="h-4 w-4 shrink-0" />
          <span className="font-semibold text-ink">
            Apply your {coupon.campaign.discountInr != null ? `₹${coupon.campaign.discountInr} off` : `${coupon.campaign.discountPercent}% off`} coupon
          </span>
          {coupon.expiresAt && <CouponCountdown expiresAt={coupon.expiresAt} />}
        </label>
      ) : (
        <p className="text-sm text-ink-muted">Have a coupon code?</p>
      )}
      <div className="flex min-w-0 items-center gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Enter code"
          className="min-h-9 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-base text-ink placeholder:text-ink-muted sm:w-64 sm:flex-none sm:text-sm"
        />
        <button
          onClick={redeem}
          disabled={redeeming || !code.trim()}
          className="min-h-9 shrink-0 rounded-xl bg-surface-2 px-3 text-sm font-semibold text-ink disabled:opacity-40"
        >
          {redeeming ? "…" : "Redeem"}
        </button>
      </div>
      {redeemError && <p className="text-xs text-accent sm:basis-full">{redeemError}</p>}
    </div>
  );
}

// A real, server-backed deadline (Coupon.expiresAt) — ticks down correctly
// even across a page reload, unlike a client-only timer that would just
// restart. Once it hits 0, /api/coupons/active stops returning this coupon
// on the next fetch (see getActiveCoupon in src/lib/coupons.ts); this just
// renders "Expired" in the meantime rather than racing a refetch.
function CouponCountdown({ expiresAt }: { expiresAt: string }) {
  const [msLeft, setMsLeft] = useState(() => new Date(expiresAt).getTime() - Date.now());

  useEffect(() => {
    const interval = setInterval(() => setMsLeft(new Date(expiresAt).getTime() - Date.now()), 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (msLeft <= 0) return <span className="text-xs font-bold text-accent">Expired</span>;
  const totalSeconds = Math.floor(msLeft / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return (
    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-bold tabular-nums text-accent">
      {minutes}:{String(seconds).padStart(2, "0")}
    </span>
  );
}

function YourPlanSection({ heading = "YOUR PLAN", children }: { heading?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-extrabold tracking-wide text-ink-muted">{heading}</h2>
      {children}
    </section>
  );
}

function PlanGroup({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-extrabold tracking-wide text-ink-muted">{heading}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

function ActivePlanCard({
  planKey,
  subtitle,
  detail,
  validUntil,
  note = "One-time purchase",
  badge = "ACTIVE",
}: {
  planKey: PlanKey;
  subtitle: string;
  detail?: string;
  validUntil?: string;
  note?: string;
  badge?: string | null;
}) {
  const meta = PLAN_META[planKey];
  return (
    <div className="flex flex-col gap-3 rounded-3xl border-2 bg-surface p-5 sm:p-6" style={{ borderColor: meta.color }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: `${meta.color}1a`, color: meta.color }}
          >
            <meta.Icon className="h-6 w-6" />
          </span>
          <p className="text-lg font-extrabold" style={{ color: meta.color }}>
            {meta.name}
          </p>
        </div>
        {badge && (
          <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold text-white" style={{ background: meta.color }}>
            {badge}
          </span>
        )}
      </div>
      <p className="text-sm font-semibold text-ink-muted">{subtitle}</p>
      {detail && <p className="text-sm text-ink-muted">{detail}</p>}
      {validUntil && <p className="text-sm font-semibold text-ink">Valid until {validUntil}</p>}
      <p className="text-xs font-semibold text-ink-muted">{note}</p>
      <div className="flex min-h-11 items-center justify-center rounded-full border border-line bg-surface-2 text-sm font-bold text-ink-muted">
        Current Plan
      </div>
    </div>
  );
}

function PlanCard({
  planKey,
  subtitle,
  price,
  original,
  percentOff,
  discountedPriceInr,
  note = "One-time purchase",
  benefits,
  ctaLabel,
  loading,
  onBuy,
  highlight,
}: {
  planKey: PlanKey;
  subtitle: string;
  price: string;
  original?: number;
  percentOff?: number;
  // A flash coupon's preview price (see previewDiscountedPrice above) — a
  // further drop *on top of* `price`, so both `original` and `price` get
  // struck through and this becomes the live number, instead of the usual
  // single strikethrough + percentOff badge.
  discountedPriceInr?: number;
  note?: string;
  benefits: string[];
  ctaLabel: string;
  loading: boolean;
  onBuy: () => void;
  highlight?: boolean;
}) {
  const meta = PLAN_META[planKey];
  return (
    <div
      className={cn(
        "relative flex flex-col gap-4 rounded-3xl bg-surface p-5",
        highlight ? "border-2 pt-7" : "mt-3 border border-line"
      )}
      style={highlight ? { borderColor: meta.color } : undefined}
    >
      {highlight && (
        <span
          className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-bold text-white shadow-md"
          style={{ background: meta.color }}
        >
          BEST VALUE
        </span>
      )}
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
          style={{ background: `${meta.color}1a`, color: meta.color }}
        >
          <meta.Icon className="h-5 w-5" />
        </span>
        <p className="font-extrabold" style={{ color: meta.color }}>
          {meta.name}
        </p>
      </div>
      <p className="text-sm font-semibold text-ink-muted">{subtitle}</p>
      {discountedPriceInr != null ? (
        <div className="flex flex-wrap items-baseline gap-1.5">
          {!!original && <span className="text-xs text-ink-muted line-through opacity-60">₹{original}</span>}
          <span className="text-sm font-semibold text-ink-muted line-through">{price}</span>
          <span className="text-2xl font-extrabold text-accent">₹{discountedPriceInr}</span>
        </div>
      ) : (
        <div className="flex flex-wrap items-baseline gap-2">
          {!!original && <span className="text-sm font-semibold text-ink-muted line-through">₹{original}</span>}
          <span className="text-2xl font-extrabold text-ink">{price}</span>
          {!!percentOff && percentOff > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-xs font-bold"
              style={{ background: `${meta.color}1a`, color: meta.color }}
            >
              {percentOff}% off
            </span>
          )}
        </div>
      )}
      <p className="text-xs font-semibold text-ink-muted">{note}</p>
      <button
        onClick={onBuy}
        disabled={loading}
        className="min-h-11 rounded-full px-5 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
        style={{ background: meta.color }}
      >
        {loading ? "Opening…" : ctaLabel}
      </button>
      <ul className="flex flex-col gap-1.5">
        {benefits.map((benefit) => (
          <li key={benefit} className="flex items-center gap-2 text-sm text-ink">
            <span className="flex h-4 w-4 shrink-0" style={{ color: meta.color }}>
              <IconCheck className="h-4 w-4" />
            </span>
            {benefit}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PaymentFooter({ isAndroidApp }: { isAndroidApp: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 pb-2 pt-2 text-center">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
        <IconLock className="h-3.5 w-3.5" />
        {isAndroidApp ? "Secure payment via Google Play" : "Secure one-time payment"}
      </p>
      <p className="text-xs text-ink-muted">
        {isAndroidApp
          ? "Game Pack is a one-time purchase. Game Pass plans auto-renew and can be managed or cancelled anytime from Google Play's subscription settings."
          : "Pay once. Play for the validity period. No recurring payments."}
      </p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-32 max-w-xl animate-pulse rounded-3xl bg-surface-2" aria-hidden />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-64 animate-pulse rounded-3xl bg-surface-2" aria-hidden />
        ))}
      </div>
    </div>
  );
}
