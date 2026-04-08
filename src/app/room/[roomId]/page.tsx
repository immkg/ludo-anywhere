"use client";

import { useEffect, useState } from "react";
import { socket } from "@/lib/socket";
import { useParams } from "next/navigation";

export default function RoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;

  const [room, setRoom] = useState<any>(null);
  const [game, setGame] = useState<any>(null);

  useEffect(() => {
    // 👇 RE-JOIN ROOM when page loads
    socket.emit("join_room", {
      roomId,
      players: [], // don't re-add players here
      deviceId: "reconnect",
    });

    socket.on("game_started", (data) => {
      setGame(data);
    });

    socket.on("game_update", (data) => {
      setGame(data);
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

      {game && (
        <div>
          <h2>Game Started 🎮</h2>

          <p>
            Current Turn:{" "}
            {game?.players?.[game?.currentTurnIndex]?.name ?? "Loading..."}
          </p>

          <p>Dice: {game.diceValue ?? "-"}</p>

          <button
            onClick={() =>
              socket.emit("roll_dice", {
                roomId,
                playerId: game?.players?.[game?.currentTurnIndex]?.id,
              })
            }
          >
            Roll Dice
          </button>

          <button onClick={() => socket.emit("next_turn", { roomId })}>
            Next Turn
          </button>
        </div>
      )}
      {game && game.players.map((p: any) => (
        <div key={p.id}>
          <h3>{p.name}</h3>

          {p?.tokens?.map((pos: number, i: number) => (
            <button
              key={i}
              onClick={() =>
                socket.emit("move_token", {
                  roomId,
                  playerId: p.id,
                  tokenIndex: i,
                })
              }
              style={{ margin: "5px" }}
            >
              Token {i + 1}: {pos}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
