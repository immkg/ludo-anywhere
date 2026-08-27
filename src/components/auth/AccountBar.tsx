"use client";

import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";
import Button from "@/components/ui/Button";

export default function AccountBar() {
  const { data: session, status } = useSession();

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
      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
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
