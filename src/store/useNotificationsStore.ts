import { create } from "zustand";

export type RoomInvite = { id: string; roomCode: string; fromName: string; fromUserId: string };
export type JoinRequest = { id: string; roomCode: string; fromUserId: string; fromName: string };
// One invite recipient who explicitly declined (see room:invite:declined)
// — keyed by roomCode+userId so InviteFriends can show "Rejected" instead
// of leaving the invite looking permanently pending.
export type DeclinedInvite = { roomCode: string; userId: string };

type NotificationsState = {
  roomInvites: RoomInvite[];
  joinRequests: JoinRequest[];
  declinedInvites: DeclinedInvite[];
  addRoomInvite: (invite: RoomInvite) => void;
  dismissRoomInvite: (id: string) => void;
  addJoinRequest: (request: JoinRequest) => void;
  removeJoinRequest: (id: string) => void;
  addDeclinedInvite: (declined: DeclinedInvite) => void;
};

// App-wide, ephemeral, never persisted — mirrors how room:invited and
// room:joinRequest:incoming are pushed (socket-only, see server.js).
export const useNotificationsStore = create<NotificationsState>((set) => ({
  roomInvites: [],
  joinRequests: [],
  declinedInvites: [],
  addRoomInvite: (invite) => set((s) => ({ roomInvites: [...s.roomInvites, invite] })),
  dismissRoomInvite: (id) => set((s) => ({ roomInvites: s.roomInvites.filter((i) => i.id !== id) })),
  addJoinRequest: (request) => set((s) => ({ joinRequests: [...s.joinRequests, request] })),
  removeJoinRequest: (id) => set((s) => ({ joinRequests: s.joinRequests.filter((r) => r.id !== id) })),
  addDeclinedInvite: (declined) =>
    set((s) =>
      s.declinedInvites.some((d) => d.roomCode === declined.roomCode && d.userId === declined.userId)
        ? s
        : { declinedInvites: [...s.declinedInvites, declined] }
    ),
}));
