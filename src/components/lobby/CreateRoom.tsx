"use client";

import { useState } from "react";
import { socket } from "@/lib/socket";
import { generateRoomCode } from "@/lib/utils";
import { useRouter } from "next/navigation";

export default function CreateRoom() {
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [playersOnDevice, setPlayersOnDevice] = useState(1);

  const router = useRouter();

  const handleCreate = () => {
    const roomId = generateRoomCode();

    socket.emit("create_room", {
      roomId,
      maxPlayers,
    });

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
    <div className="p-4">
      <h2>Create Room</h2>

      <label>Total Players</label>
      <select onChange={(e) => setMaxPlayers(Number(e.target.value))}>
        {[2, 3, 4, 5, 6].map((n) => (
          <option key={n}>{n}</option>
        ))}
      </select>

      <label>Players on this device</label>
      <input
        type="number"
        min={1}
        max={maxPlayers}
        value={playersOnDevice}
        onChange={(e) => setPlayersOnDevice(Number(e.target.value))}
      />

      <button onClick={handleCreate}>Create</button>
    </div>
  );
}