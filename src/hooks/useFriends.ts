"use client";

import { useCallback, useEffect, useState } from "react";
import { refreshPresence } from "@/lib/socketActions";
import { usePresenceStore } from "@/store/usePresenceStore";
import type { Friend, FriendRequest } from "@/types/friend";

// REST CRUD for friends/requests, mirroring useProfiles.ts — presence
// (online/roomCode) is layered on separately by usePresenceStore, fed by
// the socket, and merged in by callers.
export function useFriends() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const setPresenceSnapshot = usePresenceStore((s) => s.setSnapshot);

  const refresh = useCallback(async () => {
    const [friendsRes, requestsRes] = await Promise.all([
      fetch("/api/friends").then((r) => r.json()),
      fetch("/api/friends/requests").then((r) => r.json()),
    ]);
    setFriends(friendsRes.friends ?? []);
    setIncoming(requestsRes.incoming ?? []);
    setOutgoing(requestsRes.outgoing ?? []);
    // A friend list fetched from a fresh page load may include people whose
    // presence was never pushed to this socket (e.g. a friendship accepted
    // just now, or the connection predating it) — pull a fresh snapshot.
    refreshPresence()
      .then((res) => setPresenceSnapshot(res.presence ?? {}))
      .catch(() => {});
  }, [setPresenceSnapshot]);

  useEffect(() => {
    let cancelled = false;
    refresh().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = useCallback(async (email: string) => {
    const res = await fetch(`/api/friends/search?email=${encodeURIComponent(email)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Search failed");
    return data.user as { userId: string; name: string | null; image: string | null } | null;
  }, []);

  const sendRequest = useCallback(
    async (addresseeId: string) => {
      const res = await fetch("/api/friends/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresseeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send request");
      await refresh();
    },
    [refresh]
  );

  const acceptRequest = useCallback(
    async (requestId: string) => {
      const res = await fetch(`/api/friends/requests/${requestId}/accept`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not accept request");
      await refresh();
    },
    [refresh]
  );

  // Same endpoint underneath — declining a pending request and unfriending
  // an accepted one are both just "delete this Friendship row" server-side.
  const declineRequest = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/friends/requests/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not decline request");
      await refresh();
    },
    [refresh]
  );

  const removeFriend = useCallback(
    async (friendshipId: string) => {
      const res = await fetch(`/api/friends/requests/${friendshipId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not remove friend");
      await refresh();
    },
    [refresh]
  );

  return { friends, incoming, outgoing, loading, search, sendRequest, acceptRequest, declineRequest, removeFriend };
}
