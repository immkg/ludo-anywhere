"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import Button from "@/components/ui/Button";

export default function AccountBar() {
  const { data: session, status } = useSession();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/friends/requests")
      .then((res) => res.json())
      .then((data) => setPendingCount(data.incoming?.length ?? 0))
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
          Manage players
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
