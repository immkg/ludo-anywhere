export type Friend = {
  friendshipId: string;
  userId: string;
  name: string | null;
  email: string | null;
  image: string | null;
  lastSeenAt: string | null;
};

export type FriendRequest = {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

// Live, socket-pushed state layered on top of the REST-fetched Friend list —
// never persisted, never fetched over REST (see src/server/presence.js).
export type Presence = {
  online: boolean;
  roomCode: string | null;
};
