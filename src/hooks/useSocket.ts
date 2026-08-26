"use client";

import { useEffect } from "react";
import { getSocket } from "@/lib/socket";
import { useRoomStore } from "@/store/useRoomStore";
import { useGameStore } from "@/store/useGameStore";
import type { Room } from "@/types/room";
import type { GameState } from "@/types/game";

// Mounted once near the app root: owns the socket connection and keeps the
// room/game stores in sync with whatever the server broadcasts.
export function useSocketConnection() {
  const setRoom = useRoomStore((s) => s.setRoom);
  const setStatus = useRoomStore((s) => s.setStatus);
  const setError = useRoomStore((s) => s.setError);
  const setGame = useGameStore((s) => s.setGame);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => setStatus("connected");
    const onDisconnect = () => setStatus("disconnected");
    const onRoomUpdate = (room: Room) => setRoom(room);
    const onGameUpdate = (game: GameState) => setGame(game);
    const onError = (payload: { message: string }) => setError(payload.message);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room:update", onRoomUpdate);
    socket.on("game:update", onGameUpdate);
    socket.on("error", onError);

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
    };
  }, [setRoom, setStatus, setError, setGame]);
}
