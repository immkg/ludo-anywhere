import Link from "next/link";
import PlayerAvatar from "@/components/lobby/PlayerAvatar";
import RankBadge from "@/components/leaderboard/RankBadge";
import { cn } from "@/lib/utils";
import type { TopPlayer } from "@/lib/leaderboard";

// Shared by HomeDashboard and GuestDashboard — the leaderboard is public
// (see src/app/leaderboard/page.tsx, guest-visible since ranking isn't
// personal data), so this same small "who's on top" preview makes sense
// whether or not there's an account yet.
export default function TopPlayersList({ players }: { players: TopPlayer[] }) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink-muted">Top Players</h2>
        {players.length > 0 && (
          <Link href="/leaderboard" className="text-xs font-semibold text-accent underline">
            View all
          </Link>
        )}
      </div>
      {players.length === 0 ? (
        <p className="mt-2 rounded-2xl border border-dashed border-line p-3 text-sm text-ink-muted">
          Play some games and the leaderboard will show up here.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {players.map((p, i) => (
            <li
              key={p.id}
              className={cn(
                "flex items-center gap-3 rounded-2xl border border-line bg-surface p-3",
                // Same responsive reveal as HomeDashboard's old Recent Rooms
                // list: 1 row on narrow phones, 2 from 390px, all from xl.
                i === 0 && "flex",
                i === 1 && "hidden min-[390px]:flex",
                i >= 2 && "hidden xl:flex"
              )}
            >
              <RankBadge rank={i + 1} />
              <PlayerAvatar name={p.name} email={p.email} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{p.name}</p>
                <p className="truncate text-xs text-ink-muted">
                  {p.wins}W &ndash; {p.losses}L
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="text-sm font-extrabold text-ink">{p.points.toLocaleString()}</span>
                <span className="text-[11px] text-ink-muted">pts</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
