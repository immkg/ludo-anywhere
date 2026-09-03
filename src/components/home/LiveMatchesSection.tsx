"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveMatches } from "@/hooks/useLiveMatches";
import { requestMidGameJoin } from "@/lib/socketActions";
import { formatElapsedShort } from "@/lib/formatDuration";
import { IconClock, IconGlobe, IconUsers } from "@/components/lobby/icons";
import type { LiveMatchSummary } from "@/types/room";

// Read-only discovery card for the home dashboard — Spectate deep-links
// into the room page's existing public-watch flow untouched. Join instead
// fires a mid-game join request (see requestMidGameJoin/
// room:midGameJoinRequest in server.js) before navigating there as a
// spectator — the host picks a seat or bot to hand over (see
// IncomingJoinRequests.tsx), and the requester is promoted from spectator
// to player automatically once approved (see useSocket.ts). Only shows
// rooms whose host opted spectatePolicy to "public" (see listLiveMatches in
// src/server/rooms.js) — never a surprise to a host who left the default
// "private" alone.
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
  const router = useRouter();
  const canJoin = match.humanCount < match.maxPlayers;
  const [joining, setJoining] = useState(false);

  const handleJoin = () => {
    setJoining(true);
    // Best-effort: a guest (no Google sign-in) can't send a join request
    // (see room:midGameJoinRequest's auth check), but can still watch —
    // land them on the room as a spectator either way rather than blocking
    // on this.
    requestMidGameJoin(match.code)
      .catch(() => {})
      .finally(() => router.push(`/room/${match.code}`));
  };

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

      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={`/room/${match.code}`}
          className="rounded-full border border-line px-3 py-1.5 text-xs font-bold text-ink active:scale-[0.98]"
        >
          Spectate
        </Link>
        {canJoin && (
          <button
            onClick={handleJoin}
            disabled={joining}
            className="rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-white active:scale-[0.98] disabled:opacity-60"
          >
            {joining ? "Joining…" : "Join"}
          </button>
        )}
      </div>
    </li>
  );
}
