"use client";

import FriendRow from "./FriendRow";
import type { Friend } from "@/types/friend";

export default function FriendsList({
  friends,
  onRemove,
}: {
  friends: Friend[];
  onRemove: (friendshipId: string) => Promise<void>;
}) {
  if (friends.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-extrabold text-ink sm:text-lg">Your friends ({friends.length})</h2>
        <p className="text-xs text-ink-muted sm:text-sm">People you can play with.</p>
      </div>
      <div className="flex flex-col gap-3">
        {friends.map((friend) => (
          <FriendRow key={friend.userId} friend={friend} onRemove={onRemove} />
        ))}
      </div>
    </section>
  );
}
