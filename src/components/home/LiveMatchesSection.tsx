"use client";

import Link from "next/link";
import { useLiveMatches } from "@/hooks/useLiveMatches";
import { formatElapsedShort } from "@/lib/formatDuration";
import { IconClock, IconGlobe, IconUsers } from "@/components/lobby/icons";
import type { LiveMatchSummary } from "@/types/room";

// Read-only discovery card for the home dashboard — every action here
// deep-links into flows that already exist and already handle their own
// approval/host-confirmation (JoinRoom.tsx's mid-game seat claim, the
// spectate page's public-watch flow), so this component itself never
// touches sockets. Only shows rooms whose host opted spectatePolicy to
// "public" (see listLiveMatches in src/server/rooms.js) — never a
// surprise to a host who left the default "private" alone.
export default function LiveMatchesSection() {
  const matches = useLiveMatches();
  if (matches.length === 0) return null;

  return (
    <section>
      <h2 className="text-sm font-bold text-ink-muted">Live Matches</h2>
      <ul className="mt-2 flex flex-col gap-2">
        {matches.map((match) => (
          <LiveMatchCard key={match.code} match={match} />
        ))}
      </ul>
    </section>
  );
}

function LiveMatchCard({ match }: { match: LiveMatchSummary }) {
  const canJoin = match.humanCount < match.maxPlayers;

  return (
    <li className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-ink-muted">
            <IconGlobe className="h-3 w-3" />
            {match.matchmaking ? "Matchmaking" : "Private"}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
            <IconUsers className="h-3.5 w-3.5" />
            {match.humanCount}/{match.maxPlayers}
          </span>
          <span className="text-xs text-ink-muted">👀 {match.spectatorCount}</span>
          <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
            <IconClock className="h-3.5 w-3.5" />
            {formatElapsedShort(match.elapsedMs)}
          </span>
        </div>
        {match.leaderName && (
          <p className="mt-1 truncate text-xs font-semibold text-ink">{match.leaderName} leading</p>
        )}
      </div>

      <Link
        href={canJoin ? `/join?code=${match.code}` : `/room/${match.code}`}
        className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-white active:scale-[0.98]"
      >
        {canJoin ? "Request to Join" : "Spectate"}
      </Link>
    </li>
  );
}
