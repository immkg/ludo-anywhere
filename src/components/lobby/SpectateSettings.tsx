"use client";

import { useState } from "react";
import { setSpectatePolicy } from "@/lib/socketActions";
import type { Room } from "@/types/room";

// Host-only, shared between WaitingRoom (lobby) and GameView (mid-game) —
// the private/public toggle from room:setSpectatePolicy in server.js, plus
// a live count. "Private" (the default) hides watchers' identity from
// everyone but the host, who only ever sees a name transiently while
// approving a request (see IncomingJoinRequests.tsx); "public" admits
// anyone with the room's link with no approval step, and everyone (not
// just the host) sees the count — see spectatorCount elsewhere in
// WaitingRoom/GameView.
export default function SpectateSettings({ room, hostSeatId }: { room: Room; hostSeatId: string }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPublic = room.spectatePolicy === "public";

  const handleToggle = async () => {
    setSaving(true);
    setError(null);
    try {
      await setSpectatePolicy(room.code, isPublic ? "private" : "public", hostSeatId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update watching settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2 p-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">
          Spectators{room.spectatorCount > 0 ? ` — ${room.spectatorCount} watching` : ""}
        </p>
        <p className="text-xs text-ink-muted">
          {isPublic
            ? "Anyone with the link can watch — no approval needed."
            : "You approve each request to watch; watchers stay anonymous to players."}
        </p>
        {error && <p className="text-xs text-accent">{error}</p>}
      </div>
      <button
        onClick={handleToggle}
        disabled={saving}
        className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-accent disabled:opacity-50"
      >
        {saving ? "…" : isPublic ? "Make private" : "Make public"}
      </button>
    </div>
  );
}
