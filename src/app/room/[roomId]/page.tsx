"use client";

import { useEffect, useState } from "react";
import { socket } from "@/lib/socket";
import { useParams } from "next/navigation";

export default function RoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;

  const [room, setRoom] = useState<any>(null);

  useEffect(() => {
    // 👇 RE-JOIN ROOM when page loads
    socket.emit("join_room", {
      roomId,
      players: [], // don't re-add players here
      deviceId: "reconnect",
    });

    socket.on("connect", () => {
      console.log("Connected to socket:", socket.id);
    });

    socket.on("room_update", (data) => {
      console.log("ROOM UPDATE:", data); // debug
      setRoom(data);
    });

    socket.on("game_started", (data) => {
      console.log("Game started", data);
    });

    return () => {
      socket.off("room_update");
      socket.off("game_started");
    };
  }, [roomId]);

  if (!room) return <div>Loading...</div>;

  return (
    <div>
      <h1>Room: {roomId}</h1>

      <h2>Players:</h2>
      {room.players.map((p: any) => (
        <div key={p.id}>
          {p.name} (Device: {p.deviceId})
        </div>
      ))}

      <button onClick={() => socket.emit("start_game", { roomId })}>
        Start Game
      </button>
    </div>
  );
}
