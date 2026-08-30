import Link from "next/link";
import { IconArrowRight } from "@/components/home/icons";
import { IconUsers, IconTrophy } from "@/components/lobby/icons";
import { formatLastSeen } from "@/lib/time";
import { cn } from "@/lib/utils";

// Fixed brand colors used elsewhere already (src/components/brand/Wordmark.tsx,
// src/game/board.js's colorForArm) — reused here rather than adding new
// theme tokens, and (like the wordmark) intentionally the same in light and
// dark mode.
const BLUE = "#1565E8";
const GREEN = "#1F9E4C";
const VIOLET = "#8b5cf6";

export type RecentRoom = {
  roomCode: string;
  playerCount: number;
  maxPlayers: number;
  endedAt: string; // ISO
};

export type DashboardStats = {
  gamesPlayed: number;
  gamesWon: number;
  winRatePercent: number | null;
  roomsCreated: number;
};

type HomeDashboardProps = {
  displayName: string;
  recentRooms: RecentRoom[];
  stats: DashboardStats;
};

// Identity/notifications/credits/account-nav now live in AuthenticatedNav
// (src/app/page.tsx wraps this component with it) — this is just the
// page's own dashboard content.
export default function HomeDashboard({ displayName, recentRooms, stats }: HomeDashboardProps) {
  const hasStats = stats.gamesPlayed > 0 || stats.roomsCreated > 0;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 pb-8 pt-4 sm:px-6 sm:pt-6 lg:gap-6 lg:px-8 lg:pt-8">
      <div>
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
          Hi {displayName}! <span aria-hidden>👋</span>
        </h1>
        <p className="mt-1 text-sm text-ink-muted sm:text-base">Ready to play some Ludo?</p>
      </div>

      {/* This page also sits beside AuthenticatedNav's persistent sidebar
          (md:flex, ~280-288px). Even waiting until lg: (1024px) to split
          into two columns wasn't enough room — sidebar + a 300px-wide right
          column left barely ~170px per Create/Join card just above 1024px.
          xl: (1280px) is where there's genuinely enough width for sidebar +
          both dashboard columns without squeezing. */}
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:gap-10">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/create"
              className="flex min-h-[128px] flex-col justify-between rounded-3xl border-2 border-accent/30 bg-accent/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_2px_0_rgba(0,0,0,0.06),0_8px_20px_-6px_var(--color-accent),0_16px_36px_-12px_var(--color-accent)] transition active:scale-[0.98] sm:min-h-[150px] sm:p-5"
            >
              <div className="min-w-0">
                <p className="text-base font-extrabold text-accent sm:text-lg">Create Room</p>
                <p className="mt-1 text-xs text-ink-muted sm:text-sm">Start a new game and invite friends</p>
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
                  Join Room
                </p>
                <p className="mt-1 text-xs text-ink-muted sm:text-sm">Enter code and join a game</p>
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

          <section>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink-muted">Recent Rooms</h2>
              {recentRooms.length > 0 && (
                <Link href="/history" className="text-xs font-semibold text-accent underline">
                  View all
                </Link>
              )}
            </div>
            {recentRooms.length === 0 ? (
              <p className="mt-2 rounded-2xl border border-dashed border-line p-3 text-sm text-ink-muted">
                Play a room and it&rsquo;ll show up here.
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {recentRooms.map((room, i) => (
                  <li
                    key={`${room.roomCode}-${room.endedAt}`}
                    className={cn(
                      "items-center gap-3 rounded-2xl border border-line bg-surface p-3",
                      // 360px shows 1 room, 390px+ shows 2, md+ shows all 3 —
                      // display (flex/hidden) is the only thing that varies
                      // per index, so it's fully replaced rather than mixed
                      // with a base "flex" that could conflict with "hidden".
                      i === 0 && "flex",
                      i === 1 && "hidden min-[390px]:flex",
                      i >= 2 && "hidden xl:flex"
                    )}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-muted">
                      <IconUsers className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{room.roomCode}</p>
                      <p className="truncate text-xs text-ink-muted">
                        {room.playerCount}/{room.maxPlayers} players · {formatLastSeen(room.endedAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-5 xl:w-[300px] xl:shrink-0 2xl:w-[360px]">
          <div className="relative hidden items-center justify-center xl:flex">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/hero-illustration.png"
              alt="Ludo board with pawns and a die"
              className="w-full max-w-[280px] object-contain 2xl:max-w-[320px]"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/star-yellow.png" alt="" aria-hidden className="absolute -left-1 top-2 h-6 w-6 opacity-90" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/cross-blue.png" alt="" aria-hidden className="absolute right-2 top-8 h-5 w-5 opacity-80" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/star-red.png" alt="" aria-hidden className="absolute bottom-4 right-0 h-5 w-5 opacity-80" />
          </div>

          {hasStats && (
            <section className="rounded-2xl border border-line bg-surface p-3 sm:p-4">
              <h2 className="text-sm font-bold text-ink-muted">Your Stats</h2>
              <div className="mt-3 grid grid-cols-3 gap-1.5 sm:gap-2">
                <StatTile value={stats.gamesPlayed} label="Games Played" color="var(--color-accent)" />
                <StatTile value={stats.gamesWon} label="Games Won" color={GREEN} />
                {stats.winRatePercent !== null && (
                  <StatTile value={`${stats.winRatePercent}%`} label="Win Rate" color={VIOLET} />
                )}
                <StatTile value={stats.roomsCreated} label="Rooms Created" color={BLUE} />
              </div>
            </section>
          )}

          <div
            className="flex items-center gap-2 rounded-2xl p-3 text-xs font-semibold sm:text-sm"
            style={{ backgroundColor: `${GREEN}1a`, color: GREEN }}
          >
            <IconTrophy className="h-4 w-4 shrink-0" />
            Invite friends and enjoy Ludo together!
          </div>

          {process.env.NODE_ENV !== "production" && (
            <Link href="/test" className="self-start text-xs font-semibold text-ink-muted underline">
              Test mode
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

function StatTile({ value, label, color }: { value: string | number; label: string; color: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 rounded-xl bg-surface-2 px-1 py-2.5 text-center sm:px-2 sm:py-3">
      <span className="text-base font-extrabold sm:text-xl" style={{ color }}>
        {value}
      </span>
      <span className="w-full text-[9.5px] leading-tight text-ink-muted sm:text-[11px]">{label}</span>
    </div>
  );
}
