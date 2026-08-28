"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { EntitlementStatus } from "@/types/billing";
import { IconStar } from "@/components/nav/icons";
import { IconArrowRight } from "@/components/home/icons";
import { cn } from "@/lib/utils";

// Same fetch + framing as the entitlement summary AccountBar used to show
// (see git history) — an existing usage entitlement, not an in-game
// currency, so it always names what it's for ("games left" / "Game
// Pass"), never just a bare number. Billing/entitlement logic itself is
// untouched (still MONTHLY/ANNUAL under the hood); this only reads
// /api/billing/status the same way the old component did, with
// customer-facing names for a one-time-purchase model — no subscriptions,
// so no "renews"/"cancel anytime" language here either.
function summarize(status: EntitlementStatus): { label: string; cta: string } {
  if (status.entitlement) {
    const until = new Date(status.entitlement.expiresAt).toLocaleDateString();
    const planName = status.entitlement.type === "ANNUAL" ? "Game Pass Annual" : "Game Pass";
    return { label: `${planName} · until ${until}`, cta: status.entitlement.type === "ANNUAL" ? "Plan" : "Upgrade" };
  }
  if (status.creditsRemaining > 0) {
    return { label: `${status.creditsRemaining} games left`, cta: "Buy more" };
  }
  const label = status.freeRemaining > 0 ? `${status.freeRemaining} free today` : "No free games left today";
  return { label, cta: "Get more" };
}

export default function CreditBalance({ className }: { className?: string }) {
  const [billing, setBilling] = useState<EntitlementStatus | null>(null);

  useEffect(() => {
    fetch("/api/billing/status")
      .then((res) => res.json())
      .then(setBilling)
      .catch(() => {});
  }, []);

  if (!billing) {
    return <div className={cn("h-14 animate-pulse rounded-2xl bg-surface-2", className)} aria-hidden />;
  }

  const { label, cta } = summarize(billing);

  return (
    <Link
      href="/pricing"
      className={cn(
        "flex min-h-11 items-center justify-between gap-2 rounded-2xl border border-accent/30 bg-accent/10 px-3 py-2.5 sm:px-4",
        className
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <IconStar className="h-4 w-4 shrink-0 text-accent" />
        <span className="truncate text-sm font-semibold text-ink">{label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-accent">
        {cta}
        <IconArrowRight className="h-3 w-3" />
      </span>
    </Link>
  );
}
