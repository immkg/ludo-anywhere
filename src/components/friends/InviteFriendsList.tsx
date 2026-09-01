"use client";

import { useState } from "react";
import { useFriends } from "@/hooks/useFriends";
import { usePresenceStore } from "@/store/usePresenceStore";
import { useNotificationsStore } from "@/store/useNotificationsStore";
import { inviteFriendToRoom } from "@/lib/socketActions";
import { cn } from "@/lib/utils";
import FriendAvatar from "./FriendAvatar";

// Online friends the host can invite straight into `roomCode` by name
// (via room:invite → the friend's own RoomInviteBanner), instead of only
// ever sharing a generic room-code/link. Originally lived only in
// WaitingRoom (lobby setup); extracted so GameMenu can mount the exact
// same list mid-game, once a seat has actually opened up for them to join
// (see openSeatCount/claimableSeatCount in GameView.tsx/engine.js) —
// same invite semantics either way, just two different mount points.
export default function InviteFriendsList({ roomCode }: { roomCode: string }) {
  const { friends, loading } = useFriends();
  const presence = usePresenceStore((s) => s.byUserId);
  const declinedInvites = useNotificationsStore((s) => s.declinedInvites);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

  if (loading) return null;

  const online = friends.filter((f) => presence[f.userId]?.online);
  if (online.length === 0) {
    return <p className="text-center text-xs text-ink-muted">No friends online right now.</p>;
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface-2 p-3">
      {online.map((friend) => {
        // Presence already tracks which room a friend is currently seated
        // in (see usePresenceStore/room:update's setUserRoom calls) — reuse
        // that instead of guessing from a local "I clicked invite" flag.
        const joined = presence[friend.userId]?.roomCode === roomCode;
        const declined = declinedInvites.some((d) => d.roomCode === roomCode && d.userId === friend.userId);
        const invited = invitedIds.has(friend.userId);
        const settled = joined || declined;
        const label = joined ? "Joined" : declined ? "Rejected" : invited ? "Invited" : "Invite";

        return (
          <div key={friend.userId} className="flex items-center gap-3">
            <FriendAvatar image={friend.image} />
            <p className="min-w-0 flex-1 truncate text-sm">{friend.name ?? friend.email}</p>
            <button
              disabled={settled || invited}
              onClick={() => {
                inviteFriendToRoom(roomCode, friend.userId).catch(() => {});
                setInvitedIds((prev) => new Set(prev).add(friend.userId));
              }}
              className={cn(
                "shrink-0 text-xs font-semibold",
                settled ? "text-ink-muted" : "text-accent underline disabled:text-ink-muted"
              )}
            >
              {label}
            </button>
          </div>
        );
      })}
    </div>
  );
}
