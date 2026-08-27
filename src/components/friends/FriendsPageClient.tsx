"use client";

import { useFriends } from "@/hooks/useFriends";
import FriendsList from "./FriendsList";
import FriendRequests from "./FriendRequests";
import FriendSearch from "./FriendSearch";
import InviteLinkCard from "./InviteLinkCard";

export default function FriendsPageClient() {
  const { friends, incoming, outgoing, loading, search, sendRequest, acceptRequest, declineRequest, removeFriend } =
    useFriends();

  return (
    <div className="flex flex-col gap-6">
      <FriendSearch search={search} onSendRequest={sendRequest} />

      <FriendRequests incoming={incoming} outgoing={outgoing} onAccept={acceptRequest} onDecline={declineRequest} />

      {loading ? (
        <p className="text-ink-muted">Loading…</p>
      ) : (
        <FriendsList friends={friends} onRemove={removeFriend} />
      )}

      <InviteLinkCard />
    </div>
  );
}
