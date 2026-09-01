"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { saveOwnedSeats } from "@/lib/identity";
import { useRoomStore } from "@/store/useRoomStore";
import { useGameStore } from "@/store/useGameStore";
import { usePresenceStore } from "@/store/usePresenceStore";
import { useNotificationsStore } from "@/store/useNotificationsStore";
import type { Room, OwnedSeat } from "@/types/room";
import type { GameState } from "@/types/game";
import type { Presence } from "@/types/friend";

// Mounted once near the app root: owns the socket connection and keeps the
// room/game/presence/notification stores in sync with whatever the server
// broadcasts. The socket connects app-wide (not just inside a room) so
// presence is accurate anywhere in the app — see src/server.js's
// `io.on("connection", ...)` for the server-side half of this.
export function useSocketConnection() {
  const router = useRouter();
  const setRoom = useRoomStore((s) => s.setRoom);
  const setStatus = useRoomStore((s) => s.setStatus);
  const setError = useRoomStore((s) => s.setError);
  const addMySeats = useRoomStore((s) => s.addMySeats);
  const setGame = useGameStore((s) => s.setGame);
  const setPresenceSnapshot = usePresenceStore((s) => s.setSnapshot);
  const applyPresenceUpdate = usePresenceStore((s) => s.applyUpdate);
  const addRoomInvite = useNotificationsStore((s) => s.addRoomInvite);
  const addJoinRequest = useNotificationsStore((s) => s.addJoinRequest);
  const addDeclinedInvite = useNotificationsStore((s) => s.addDeclinedInvite);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => setStatus("connected");
    const onDisconnect = () => setStatus("disconnected");
    const onRoomUpdate = (room: Room) => setRoom(room);
    const onGameUpdate = (game: GameState) => setGame(game);
    const onError = (payload: { message: string }) => setError(payload.message);
    const onPresenceSnapshot = (snapshot: Record<string, Presence>) => setPresenceSnapshot(snapshot);
    const onPresenceUpdate = (payload: { userId: string; online: boolean; roomCode: string | null }) =>
      applyPresenceUpdate(payload.userId, { online: payload.online, roomCode: payload.roomCode });
    const onRoomInvited = (payload: { roomCode: string; fromName: string; fromUserId: string }) =>
      addRoomInvite({ id: crypto.randomUUID(), ...payload });
    const onJoinRequestIncoming = (payload: { roomCode: string; fromUserId: string; fromName: string }) =>
      addJoinRequest({ id: crypto.randomUUID(), kind: "seat", ...payload });
    const onWatchRequestIncoming = (payload: { roomCode: string; fromUserId: string; fromName: string }) =>
      addJoinRequest({ id: crypto.randomUUID(), kind: "spectate", ...payload });
    const onInviteDeclined = (payload: { roomCode: string; byUserId: string }) =>
      addDeclinedInvite({ roomCode: payload.roomCode, userId: payload.byUserId });
    // A rematch's new seats are pushed directly (see room:rematch in
    // server.js) rather than requiring everyone to manually rejoin —
    // whoever's still on the finished game's screen gets navigated
    // straight into the new one.
    const onRematchReady = ({ roomCode, seats }: { roomCode: string; seats: OwnedSeat[] }) => {
      saveOwnedSeats(roomCode, seats);
      addMySeats(seats);
      router.push(`/room/${roomCode}`);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room:update", onRoomUpdate);
    socket.on("game:update", onGameUpdate);
    socket.on("error", onError);
    socket.on("presence:snapshot", onPresenceSnapshot);
    socket.on("presence:update", onPresenceUpdate);
    socket.on("room:invited", onRoomInvited);
    socket.on("room:joinRequest:incoming", onJoinRequestIncoming);
    socket.on("room:watchRequest:incoming", onWatchRequestIncoming);
    socket.on("room:invite:declined", onInviteDeclined);
    socket.on("room:rematchReady", onRematchReady);

    if (!socket.connected) {
      setStatus("connecting");
      socket.connect();
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room:update", onRoomUpdate);
      socket.off("game:update", onGameUpdate);
      socket.off("error", onError);
      socket.off("presence:snapshot", onPresenceSnapshot);
      socket.off("presence:update", onPresenceUpdate);
      socket.off("room:invited", onRoomInvited);
      socket.off("room:joinRequest:incoming", onJoinRequestIncoming);
      socket.off("room:watchRequest:incoming", onWatchRequestIncoming);
      socket.off("room:invite:declined", onInviteDeclined);
      socket.off("room:rematchReady", onRematchReady);
    };
  }, [
    router,
    setRoom,
    setStatus,
    setError,
    addMySeats,
    setGame,
    setPresenceSnapshot,
    applyPresenceUpdate,
    addRoomInvite,
    addJoinRequest,
    addDeclinedInvite,
  ]);
}
