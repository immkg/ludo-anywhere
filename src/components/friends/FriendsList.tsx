"use client";

import { useState } from "react";
import { formatLastSeen } from "@/lib/time";
import { usePresenceStore } from "@/store/usePresenceStore";
import FriendAvatar from "./FriendAvatar";
import type { Friend } from "@/types/friend";

export default function FriendsList({
  friends,
  onRemove,
}: {
  friends: Friend[];
  onRemove: (friendshipId: string) => Promise<void>;
}) {
  const presence = usePresenceStore((s) => s.byUserId);
  const [removingId, setRemovingId] = useState<string | null>(null);

  if (friends.length === 0) {
    return <p className="text-ink-muted">No friends yet — search by email or share your invite link below.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {friends.map((friend) => {
        const online = presence[friend.userId]?.online ?? false;
        return (
          <div
            key={friend.userId}
            className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3"
          >
            <FriendAvatar image={friend.image} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{friend.name ?? friend.email}</p>
              <p className={`truncate text-xs ${online ? "font-semibold text-accent" : "text-ink-muted"}`}>
                {online ? "Online now" : formatLastSeen(friend.lastSeenAt)}
              </p>
            </div>
            <button
              disabled={removingId === friend.friendshipId}
              onClick={async () => {
                setRemovingId(friend.friendshipId);
                try {
                  await onRemove(friend.friendshipId);
                } finally {
                  setRemovingId(null);
                }
              }}
              className="shrink-0 text-xs font-semibold text-ink-muted underline disabled:opacity-40"
            >
              Remove
            </button>
          </div>
        );
      })}
    </div>
  );
}
