import { create } from "zustand";

export type RoomInvite = { id: string; roomCode: string; fromName: string };
export type JoinRequest = { id: string; roomCode: string; fromUserId: string; fromName: string };

type NotificationsState = {
  roomInvites: RoomInvite[];
  joinRequests: JoinRequest[];
  addRoomInvite: (invite: RoomInvite) => void;
  dismissRoomInvite: (id: string) => void;
  addJoinRequest: (request: JoinRequest) => void;
  removeJoinRequest: (id: string) => void;
};

// App-wide, ephemeral, never persisted — mirrors how room:invited and
// room:joinRequest:incoming are pushed (socket-only, see server.js).
export const useNotificationsStore = create<NotificationsState>((set) => ({
  roomInvites: [],
  joinRequests: [],
  addRoomInvite: (invite) => set((s) => ({ roomInvites: [...s.roomInvites, invite] })),
  dismissRoomInvite: (id) => set((s) => ({ roomInvites: s.roomInvites.filter((i) => i.id !== id) })),
  addJoinRequest: (request) => set((s) => ({ joinRequests: [...s.joinRequests, request] })),
  removeJoinRequest: (id) => set((s) => ({ joinRequests: s.joinRequests.filter((r) => r.id !== id) })),
}));
