"use client";

import { useState } from "react";
import { socket } from "@/lib/socket";
import { useRouter } from "next/navigation";

export default function JoinRoom() {
  const [roomId, setRoomId] = useState("");
  const [playersOnDevice, setPlayersOnDevice] = useState(1);

  const router = useRouter();

  const handleJoin = () => {
    const players = Array.from({ length: playersOnDevice }).map((_, i) => ({
      id: `${Date.now()}-${i}`,
      name: `Player ${i + 1}`,
    }));

    socket.emit("join_room", {
      roomId,
      players,
      deviceId: crypto.randomUUID(),
    });

    router.push(`/room/${roomId}`);
  };

  return (
    <div>
      <input
        placeholder="Enter Room Code"
        onChange={(e) => setRoomId(e.target.value)}
      />

      <input
        type="number"
        min={1}
        value={playersOnDevice}
        onChange={(e) => setPlayersOnDevice(Number(e.target.value))}
      />

      <button onClick={handleJoin}>Join</button>
    </div>
  );
}