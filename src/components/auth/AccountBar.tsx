"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import Button from "@/components/ui/Button";
import type { EntitlementStatus } from "@/types/billing";
import { useIsAndroidApp } from "@/lib/android-app";

function planSummary(status: EntitlementStatus): { label: string; cta: string } {
  if (status.entitlement) {
    const until = new Date(status.entitlement.expiresAt).toLocaleDateString();
    const planName = status.entitlement.type === "ANNUAL" ? "Annual plan" : "Monthly plan";
    return { label: `${planName} · until ${until}`, cta: status.entitlement.type === "ANNUAL" ? "Plan" : "Upgrade" };
  }
  // Credits are spent before free games (see resolveCharge), so once you
  // own any, that's the number that matters — not today's free count.
  if (status.creditsRemaining > 0) {
    return { label: `${status.creditsRemaining} credits left`, cta: "Buy more" };
  }
  const label = status.freeRemaining > 0 ? `${status.freeRemaining} free today` : "No free games left today";
  return { label, cta: "Get more" };
}

export default function AccountBar() {
  const { data: session, status } = useSession();
  const [pendingCount, setPendingCount] = useState(0);
  const [billing, setBilling] = useState<EntitlementStatus | null>(null);
  const isAndroidApp = useIsAndroidApp();

  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/friends/requests")
      .then((res) => res.json())
      .then((data) => setPendingCount(data.incoming?.length ?? 0))
      .catch(() => {});
    fetch("/api/billing/status")
      .then((res) => res.json())
      .then(setBilling)
      .catch(() => {});
  }, [session?.user]);

  if (status === "loading") {
    return <div className="h-10" />;
  }

  if (!session?.user) {
    return (
      <Button variant="secondary" className="w-full" onClick={() => signIn("google")}>
        Sign in with Google
      </Button>
    );
  }

  const plan = billing ? planSummary(billing) : null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3">
      <div className="flex items-center gap-3">
        {session.user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={session.user.image}
            alt=""
            referrerPolicy="no-referrer"
            className="h-9 w-9 shrink-0 rounded-full border border-line"
          />
        ) : (
          <span className="h-9 w-9 shrink-0 rounded-full border border-line bg-surface-2" />
        )}
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">
          {session.user.name ?? session.user.email}
        </p>
        <button
          onClick={() => signOut()}
          className="shrink-0 text-xs font-semibold text-ink-muted underline"
        >
          Sign out
        </button>
      </div>
      {plan && isAndroidApp && (
        <div className="flex items-center rounded-xl bg-surface-2 px-3 py-2 text-xs font-semibold text-ink-muted">
          <span>{plan.label}</span>
        </div>
      )}
      {plan && !isAndroidApp && (
        <Link
          href="/pricing"
          className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-xs font-semibold text-ink-muted"
        >
          <span>{plan.label}</span>
          <span className="text-accent underline">{plan.cta}</span>
        </Link>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line pt-3">
        <Link href="/friends" className="relative whitespace-nowrap text-xs text-ink-muted underline">
          Friends
          {pendingCount > 0 && (
            <span className="absolute -top-2 -right-3 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white no-underline">
              {pendingCount}
            </span>
          )}
        </Link>
        <Link href="/profiles" className="whitespace-nowrap text-xs text-ink-muted underline">
          Players
        </Link>
        <Link href="/history" className="whitespace-nowrap text-xs text-ink-muted underline">
          History
        </Link>
        <Link href="/leaderboard" className="whitespace-nowrap text-xs text-ink-muted underline">
          Leaderboard
        </Link>
      </div>
    </div>
  );
}
