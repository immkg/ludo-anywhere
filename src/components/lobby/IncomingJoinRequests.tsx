"use client";

import {
  approveJoinRequest,
  declineJoinRequest,
  approveWatchRequest,
  declineWatchRequest,
  approveMidGameJoinRequest,
  declineMidGameJoinRequest,
} from "@/lib/socketActions";
import { useNotificationsStore } from "@/store/useNotificationsStore";
import type { Room } from "@/types/room";
import type { GameState } from "@/types/game";

// One target the host can hand a mid-game join request to — mirrors
// assignMidGameSeat's own "available" condition (src/server/rooms.js) so
// the list shown here never offers something the server would reject; the
// server re-checks anyway, so a stale list (someone else got approved a
// moment earlier) just fails gracefully rather than corrupting anything.
type MidGameTarget = { seatId: string; label: string };

function midGameJoinTargets(room: Room, game: GameState): MidGameTarget[] {
  const targets: MidGameTarget[] = [];
  for (const seat of room.seats) {
    const gameSeat = game.seats.find((s) => s.id === seat.id);
    if (!gameSeat) continue;
    const removedUnclaimed = gameSeat.finished && !game.placements.includes(seat.id);
    const available = seat.bot || gameSeat.suspended || removedUnclaimed || (!seat.connected && !gameSeat.finished);
    if (!available) continue;
    targets.push({ seatId: seat.id, label: seat.bot ? `Replace ${seat.name}` : "Open seat" });
  }
  for (const vacated of room.vacatedSeats) {
    targets.push({ seatId: vacated.id, label: "Open seat" });
  }
  return targets;
}

// Shared between WaitingRoom (lobby) and GameView (mid-game) — a request
// looks and resolves identically either way, whether it's someone asking to
// join the lobby, someone asking to take over a paused/vacated seat
// mid-game (see room:claimSeat in server.js), someone (kind: "spectate")
// asking to watch a "private" room (see room:watch/room:watchRequest:approve
// in server.js), or (kind: "midGameJoin") someone asking, from the home
// dashboard's Live Matches, to join an already-playing game — that last
// kind is the odd one out: approving it means the host first picks which
// open seat or bot to hand over, so it needs `room`/`game` to compute the
// options (only ever passed by GameView, the only place this kind occurs).
export default function IncomingJoinRequests({ roomCode, room, game }: { roomCode: string; room?: Room; game?: GameState }) {
  // Filtering happens outside the selector — a selector that returns a new
  // array each call defeats zustand's reference-equality check and loops.
  const allRequests = useNotificationsStore((s) => s.joinRequests);
  const removeJoinRequest = useNotificationsStore((s) => s.removeJoinRequest);
  const requests = allRequests.filter((r) => r.roomCode === roomCode);

  if (requests.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {requests.map((req) => {
        if (req.kind === "midGameJoin") {
          const targets = room && game ? midGameJoinTargets(room, game) : [];
          return (
            <div key={req.id} className="flex flex-col gap-2 rounded-2xl border border-accent bg-surface p-3">
              <p className="text-sm">
                <span className="font-semibold">{req.fromName}</span> wants to join
              </p>
              {targets.length === 0 ? (
                <p className="text-xs text-ink-muted">No open seat or bot to hand over right now.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {targets.map((target) => (
                    <button
                      key={target.seatId}
                      onClick={() => {
                        approveMidGameJoinRequest(roomCode, req.fromUserId, target.seatId).catch(() => {});
                        removeJoinRequest(req.id);
                      }}
                      className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      {target.label}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => {
                  declineMidGameJoinRequest(roomCode, req.fromUserId);
                  removeJoinRequest(req.id);
                }}
                className="self-start text-xs font-semibold text-ink-muted underline"
              >
                Decline
              </button>
            </div>
          );
        }

        const isSpectate = req.kind === "spectate";
        return (
          <div key={req.id} className="flex items-center gap-3 rounded-2xl border border-accent bg-surface p-3">
            <p className="min-w-0 flex-1 text-sm">
              <span className="font-semibold">{req.fromName}</span> wants to {isSpectate ? "watch" : "join"}
            </p>
            <button
              onClick={() => {
                (isSpectate ? approveWatchRequest : approveJoinRequest)(roomCode, req.fromUserId).catch(() => {});
                removeJoinRequest(req.id);
              }}
              className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white"
            >
              Approve
            </button>
            <button
              onClick={() => {
                (isSpectate ? declineWatchRequest : declineJoinRequest)(roomCode, req.fromUserId);
                removeJoinRequest(req.id);
              }}
              className="shrink-0 text-xs font-semibold text-ink-muted underline"
            >
              Decline
            </button>
          </div>
        );
      })}
    </div>
  );
}
