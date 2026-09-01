"use client";

import {
  approveJoinRequest,
  declineJoinRequest,
  approveWatchRequest,
  declineWatchRequest,
} from "@/lib/socketActions";
import { useNotificationsStore } from "@/store/useNotificationsStore";

// Shared between WaitingRoom (lobby) and GameView (mid-game) — a request
// looks and resolves identically either way, whether it's someone asking to
// join the lobby, someone asking to take over a paused/vacated seat
// mid-game (see room:claimSeat in server.js), or (kind: "spectate") someone
// asking to watch a "private" room (see room:watch/room:watchRequest:approve
// in server.js) — approving each just calls a different pair of actions.
export default function IncomingJoinRequests({ roomCode }: { roomCode: string }) {
  // Filtering happens outside the selector — a selector that returns a new
  // array each call defeats zustand's reference-equality check and loops.
  const allRequests = useNotificationsStore((s) => s.joinRequests);
  const removeJoinRequest = useNotificationsStore((s) => s.removeJoinRequest);
  const requests = allRequests.filter((r) => r.roomCode === roomCode);

  if (requests.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {requests.map((req) => {
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
