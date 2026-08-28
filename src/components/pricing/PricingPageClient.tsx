"use client";

import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { BillingPurpose, EntitlementStatus } from "@/types/billing";
import { cn } from "@/lib/utils";
import { IconCheck, IconCrown, IconUsers } from "@/components/lobby/icons";
import { IconLightning } from "@/components/home/icons";
import { IconGift, IconSprout, IconLock } from "@/components/pricing/icons";

// These are one-time purchases, not subscriptions — no renewal, no
// cancellation, no recurring billing. The copy and states below are built
// around expiry, never renewal. "MONTHLY"/"ANNUAL"/"PACK" below are the
// existing backend entitlement/purpose identifiers (src/types/billing.ts);
// only their customer-facing names change here.
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

export default function PricingPageClient() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const processing = searchParams.get("status") === "processing";

  const [status, setStatus] = useState<EntitlementStatus | null>(null);
  const [buying, setBuying] = useState<BillingPurpose | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelayed, setConfirmDelayed] = useState(false);

  useEffect(() => {
    fetchStatus().then(setStatus);
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

  const buy = useCallback(
    async (purpose: BillingPurpose) => {
      if (!session?.user) return;
      setBuying(purpose);
      setError(null);
      try {
        const res = await fetch("/api/billing/uropai/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purpose }),
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
    [session]
  );

  const planType = status?.entitlement?.type ?? null;
  const hasPack = (status?.creditsRemaining ?? 0) > 0;

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

      <HostBenefitBanner />

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
              benefits={["Unlimited games", "Any player count", "Play with friends", `Valid for ${status.pricing.monthly.days} days`]}
              ctaLabel="Buy Game Pass"
              loading={buying === "MONTHLY"}
              onBuy={() => buy("MONTHLY")}
            />
          </PlanGroup>
        </>
      )}

      <PaymentFooter />
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

function PaymentFooter() {
  return (
    <div className="flex flex-col items-center gap-1 pb-2 pt-2 text-center">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
        <IconLock className="h-3.5 w-3.5" />
        Secure one-time payment
      </p>
      <p className="text-xs text-ink-muted">Pay once. Play for the validity period. No recurring payments.</p>
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
