"use client";

import { useFriends } from "@/hooks/useFriends";
import RoomReadyBanner from "./RoomReadyBanner";
import FriendsList from "./FriendsList";
import FriendRequests from "./FriendRequests";
import FriendSearch from "./FriendSearch";
import InviteLinkCard from "./InviteLinkCard";

export default function FriendsPageClient() {
  const { friends, incoming, outgoing, loading, search, sendRequest, acceptRequest, declineRequest, removeFriend } =
    useFriends();

  return (
    <div className="flex flex-col gap-6">
      <RoomReadyBanner />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          <FriendSearch search={search} onSendRequest={sendRequest} friends={friends} outgoing={outgoing} />
        </div>

        <div className="flex flex-col gap-6">
          <FriendRequests incoming={incoming} outgoing={outgoing} onAccept={acceptRequest} onDecline={declineRequest} />

          {loading ? (
            <div className="flex flex-col gap-3" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface-2" />
              ))}
            </div>
          ) : (
            <FriendsList friends={friends} onRemove={removeFriend} />
          )}
        </div>
      </div>

      <InviteLinkCard />
    </div>
  );
}
