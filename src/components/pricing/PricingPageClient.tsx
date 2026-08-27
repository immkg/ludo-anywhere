"use client";

import Link from "next/link";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Button from "@/components/ui/Button";
import type { BillingPurpose, EntitlementStatus, RazorpayOrderResponse } from "@/types/billing";

// Razorpay Checkout is loaded from their CDN as a plain script (not an npm
// package) and attaches itself to `window.Razorpay` — this is the minimal
// shape this page actually calls.
type RazorpayCheckout = {
  open: () => void;
};
type RazorpayConstructor = new (options: {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description: string;
  prefill?: { email?: string | null };
  theme?: { color: string };
  handler: () => void;
  modal?: { ondismiss?: () => void };
}) => RazorpayCheckout;

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
  const scriptLoaded = useRef(false);

  useEffect(() => {
    fetchStatus().then(setStatus);
  }, []);

  // While "processing", the purchase itself already succeeded at Razorpay —
  // we're just waiting for the webhook to land and grant the entitlement,
  // so poll briefly rather than trust the client-side checkout callback.
  useEffect(() => {
    if (!processing) return;
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts += 1;
      const next = await fetchStatus();
      if (next) setStatus(next);
      if (attempts >= 5) {
        clearInterval(interval);
        router.replace("/pricing");
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [processing, router]);

  const buy = useCallback(
    async (purpose: BillingPurpose) => {
      if (!scriptLoaded.current || !session?.user) return;
      setBuying(purpose);
      setError(null);
      try {
        const res = await fetch("/api/billing/razorpay/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purpose }),
        });
        if (!res.ok) throw new Error("Could not start checkout");
        const order: RazorpayOrderResponse = await res.json();

        const Razorpay = (window as unknown as { Razorpay: RazorpayConstructor }).Razorpay;
        const checkout = new Razorpay({
          key: order.keyId,
          amount: order.amountInr * 100,
          currency: "INR",
          order_id: order.orderId,
          name: "Ludo Anywhere",
          description: purposeLabel(purpose),
          prefill: { email: session.user.email },
          theme: { color: "#ff6b3d" },
          handler: () => router.push("/pricing?status=processing"),
          modal: { ondismiss: () => setBuying(null) },
        });
        checkout.open();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start checkout");
      } finally {
        setBuying(null);
      }
    },
    [session, router]
  );

  const planType = status?.entitlement?.type ?? null;
  const hasActivePack = (status?.creditsRemaining ?? 0) > 0;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 px-6 py-8">
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        onLoad={() => {
          scriptLoaded.current = true;
        }}
      />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Get more games</h1>
        <Link href="/" className="text-sm font-semibold text-ink-muted underline">
          Home
        </Link>
      </div>

      {processing && (
        <p className="rounded-2xl border border-line bg-surface-2 p-3 text-sm text-ink-muted">
          Confirming your payment…
        </p>
      )}
      {error && <p className="text-sm text-accent">{error}</p>}

      {/* Annual is the top tier — once active there's nothing left to buy,
          so the page collapses to just that status. */}
      {planType === "ANNUAL" && status && (
        <PlanStatusCard title="Annual plan" until={status.entitlement!.expiresAt} detail="Unlimited games, every game you host is free for everyone who joins." />
      )}

      {/* Monthly can still upgrade — show status plus the one relevant
          offer. Game Pack / plain Monthly / plain Annual cards would all
          be dead weight here (a subscription always covers usage first). */}
      {planType === "MONTHLY" && status && (
        <>
          <PlanStatusCard title="Monthly plan" until={status.entitlement!.expiresAt} detail="Unlimited games, every game you host is free for everyone who joins." />
          {status.upgradeOffer && (
            <PricingCard
              title="Upgrade to Annual"
              price={`₹${status.upgradeOffer.priceInr}`}
              original={status.upgradeOffer.discountInr > 0 ? status.pricing.annual.priceInr : undefined}
              detail={
                status.upgradeOffer.discountInr > 0
                  ? `Includes ₹${status.upgradeOffer.discountInr} credit for your remaining Monthly days`
                  : "Locks in a full year, no more monthly renewals"
              }
              loading={buying === "ANNUAL"}
              onBuy={() => buy("ANNUAL")}
            />
          )}
        </>
      )}

      {planType === null && (
        <>
          {/* Once you own credits, they're what actually get spent (see
              resolveCharge) — showing today's free count here would just
              be describing games you're not going to use. */}
          {(!status || status.creditsRemaining === 0) && (
            <div className="rounded-2xl border border-line bg-surface p-4">
              <p className="font-semibold">Free</p>
              <p className="mt-1 text-sm text-ink-muted">
                {status ? `${status.freeRemaining} free game${status.freeRemaining === 1 ? "" : "s"} left today` : "…"}
              </p>
            </div>
          )}

          {status && status.creditsRemaining > 0 ? (
            <PricingCard
              title="Game Pack"
              price={`${status.creditsRemaining} left`}
              detail={`${status.pricing.gamePack.credits} games per pack, any player count`}
              loading={buying === "PACK"}
              onBuy={() => buy("PACK")}
              buyLabel="Buy more"
            />
          ) : (
            <PricingCard
              title="Game Pack"
              price={status ? `₹${status.pricing.gamePack.priceInr}` : "…"}
              original={status ? status.pricing.gamePack.originalPriceInr : undefined}
              percentOff={status?.pricing.gamePack.percentOff}
              detail={status ? `${status.pricing.gamePack.credits} games, any player count` : ""}
              loading={buying === "PACK"}
              onBuy={() => buy("PACK")}
            />
          )}

          <PricingCard
            title="Monthly"
            price={status ? `₹${status.pricing.monthly.priceInr}/month` : "…"}
            original={status ? status.pricing.monthly.originalPriceInr : undefined}
            percentOff={status?.pricing.monthly.percentOff}
            detail="Unlimited games"
            loading={buying === "MONTHLY"}
            onBuy={() => buy("MONTHLY")}
            buyLabel={hasActivePack ? "Upgrade to Monthly" : undefined}
          />
          <PricingCard
            title="Annual"
            price={status ? `₹${status.pricing.annual.priceInr}/year` : "…"}
            original={status ? status.pricing.annual.originalPriceInr : undefined}
            percentOff={status?.pricing.annual.percentOff}
            detail="Unlimited games, best value"
            loading={buying === "ANNUAL"}
            onBuy={() => buy("ANNUAL")}
            buyLabel={hasActivePack ? "Upgrade to Annual" : undefined}
          />
        </>
      )}

      <p className="text-center text-xs text-ink-muted">
        When you host a game on any paid plan, everyone who joins plays free.
      </p>
    </main>
  );
}

function purposeLabel(purpose: BillingPurpose) {
  if (purpose === "PACK") return "Game Pack";
  if (purpose === "MONTHLY") return "Monthly pass";
  return "Annual pass";
}

function PlanStatusCard({ title, until, detail }: { title: string; until: string; detail: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-accent bg-surface p-4">
      <p className="font-semibold text-accent">{title}</p>
      <p className="text-sm text-ink-muted">{detail}</p>
      <p className="text-xs font-semibold text-ink-muted">Active until {new Date(until).toLocaleDateString()}</p>
    </div>
  );
}

function PricingCard({
  title,
  price,
  original,
  percentOff,
  detail,
  loading,
  onBuy,
  buyLabel,
}: {
  title: string;
  price: string;
  original?: number;
  percentOff?: number;
  detail: string;
  loading: boolean;
  onBuy: () => void;
  buyLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-semibold">{title}</p>
        <div className="flex items-baseline gap-2">
          {!!original && (
            <span className="text-sm text-ink-muted line-through">₹{original}</span>
          )}
          <span className="text-lg font-extrabold">{price}</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">{detail}</p>
        {!!percentOff && percentOff > 0 && (
          <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent">
            {percentOff}% off
          </span>
        )}
      </div>
      <Button variant="secondary" disabled={loading} onClick={onBuy}>
        {loading ? "Opening…" : (buyLabel ?? `Buy ${title}`)}
      </Button>
    </div>
  );
}
