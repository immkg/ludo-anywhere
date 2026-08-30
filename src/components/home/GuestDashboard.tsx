"use client";

import { useEffect } from "react";
import Link from "next/link";
import posthog from "posthog-js";
import { IconArrowRight } from "@/components/home/icons";
import { IconUsers, IconTrophy, IconClock } from "@/components/lobby/icons";
import TopPlayersList from "@/components/home/TopPlayersList";
import type { TopPlayer } from "@/lib/leaderboard";

const BLUE = "#1565E8";

// Logged-out counterpart to HomeDashboard — reachable via the "Play Now"
// button on the marketing landing page (LandingHero.tsx). No stats/recent
// rooms (nothing to show without an account); Create still routes to
// /create, which itself prompts sign-in inline (see CreateRoom.tsx) —
// Join is fully playable as a guest. The leaderboard itself is public (see
// src/app/leaderboard/page.tsx), so the same Top Players preview
// HomeDashboard shows makes sense here too.
export default function GuestDashboard({ topPlayers }: { topPlayers: TopPlayer[] }) {
  useEffect(() => {
    posthog.capture("guest_dashboard_viewed");
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 pb-8 pt-4 sm:px-6 sm:pt-6 lg:gap-6 lg:px-8 lg:pt-8">
      <div>
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
          Ready to play some Ludo? <span aria-hidden>🎲</span>
        </h1>
        <p className="mt-1 text-sm text-ink-muted sm:text-base">
          Join a friend&rsquo;s room right away, or sign in to create your own.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/create"
          className="flex min-h-[128px] flex-col justify-between rounded-3xl border-2 border-accent/30 bg-accent/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_2px_0_rgba(0,0,0,0.06),0_8px_20px_-6px_var(--color-accent),0_16px_36px_-12px_var(--color-accent)] transition active:scale-[0.98] sm:min-h-[150px] sm:p-5"
        >
          <div className="min-w-0">
            <p className="text-base font-extrabold text-accent sm:text-lg">Play Now</p>
            <p className="mt-1 text-xs text-ink-muted sm:text-sm">Start a new game now</p>
          </div>
          <div className="flex items-end justify-between gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/pawn-yellow.png" alt="" aria-hidden className="h-9 w-auto sm:h-11" />
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-white sm:h-9 sm:w-9">
              <IconArrowRight className="h-4 w-4" />
            </span>
          </div>
        </Link>

        <Link
          href="/join"
          className="flex min-h-[128px] flex-col justify-between rounded-3xl border-2 p-4 transition active:scale-[0.98] sm:min-h-[150px] sm:p-5"
          style={{
            borderColor: `${BLUE}4d`,
            backgroundColor: `${BLUE}14`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.6), 0 2px 0 rgba(0,0,0,0.06), 0 8px 20px -6px ${BLUE}80, 0 16px 36px -12px ${BLUE}80`,
          }}
        >
          <div className="min-w-0">
            <p className="text-base font-extrabold sm:text-lg" style={{ color: BLUE }}>
              I Have a Code
            </p>
            <p className="mt-1 text-xs text-ink-muted sm:text-sm">Join a friend&rsquo;s game</p>
          </div>
          <div className="flex items-end justify-between gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/pawn-blue.png" alt="" aria-hidden className="h-9 w-auto sm:h-11" />
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white sm:h-9 sm:w-9"
              style={{ backgroundColor: BLUE }}
            >
              <IconArrowRight className="h-4 w-4" />
            </span>
          </div>
        </Link>
      </div>

      <TopPlayersList players={topPlayers} />

      <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <h2 className="text-sm font-bold text-ink-muted">See more once you sign in</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Link
            href="/leaderboard"
            className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-sm font-semibold text-ink"
          >
            <IconTrophy className="h-4 w-4 shrink-0 text-ink-muted" />
            Leaderboard
          </Link>
          <Link
            href="/history"
            className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-sm font-semibold text-ink"
          >
            <IconClock className="h-4 w-4 shrink-0 text-ink-muted" />
            Game history
          </Link>
          <Link
            href="/friends"
            className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-sm font-semibold text-ink"
          >
            <IconUsers className="h-4 w-4 shrink-0 text-ink-muted" />
            Friends
          </Link>
        </div>
      </section>
    </main>
  );
}
