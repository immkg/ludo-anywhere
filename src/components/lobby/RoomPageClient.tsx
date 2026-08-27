"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useRoomStore } from "@/store/useRoomStore";
import { loadOwnedSeats, saveOwnedSeats } from "@/lib/identity";
import { joinRoom } from "@/lib/socketActions";
import Button from "@/components/ui/Button";
import WaitingRoom from "@/components/lobby/WaitingRoom";
import GameView from "@/components/game/GameView";

export default function RoomPageClient() {
  const params = useParams();
  const router = useRouter();
  const roomCode = String(params.roomId).toUpperCase();

  const room = useRoomStore((s) => s.room);
  const addMySeats = useRoomStore((s) => s.addMySeats);
  const mySeats = useRoomStore((s) => s.mySeats);

  const [rejoinState, setRejoinState] = useState<"pending" | "ok" | "none">("pending");

  useEffect(() => {
    const known = loadOwnedSeats(roomCode);
    joinRoom(roomCode, [], known.map((s) => s.token))
      .then((res) => {
        if (res.seats) {
          saveOwnedSeats(roomCode, res.seats);
          addMySeats(res.seats);
        }
        setRejoinState("ok");
      })
      .catch(() => setRejoinState("none"));
  }, [roomCode, addMySeats]);

  const myRelevantSeats = mySeats.filter((s) => room?.seats.some((rs) => rs.id === s.id));

  if (rejoinState === "pending") {
    return <div className="flex min-h-dvh items-center justify-center text-ink-muted">Loading room…</div>;
  }

  if (rejoinState === "none" || !room || myRelevantSeats.length === 0) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-ink-muted">You&rsquo;re not seated in room {roomCode}.</p>
        <Button onClick={() => router.push(`/join`)}>Join a room</Button>
      </div>
    );
  }

  if (room.status === "lobby") {
    return <WaitingRoom room={room} mySeats={myRelevantSeats} />;
  }

  return <GameView room={room} />;
}
