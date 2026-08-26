"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { joinRoom } from "@/lib/socketActions";
import { saveOwnedSeats } from "@/lib/identity";
import { useRoomStore } from "@/store/useRoomStore";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import NumberPicker from "@/components/ui/NumberPicker";
import SeatRow, { defaultSeats, type SeatDraft } from "@/components/lobby/SeatRow";

export default function JoinRoom() {
  const router = useRouter();
  const addMySeats = useRoomStore((s) => s.addMySeats);

  const [roomCode, setRoomCode] = useState("");
  const [seats, setSeats] = useState<SeatDraft[]>(defaultSeats(1, []));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async () => {
    if (roomCode.trim().length < 4) {
      setError("Enter the room code");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const finalSeats = seats.map((s, i) => ({ name: s.name.trim() || `Player ${i + 1}` }));
      const res = await joinRoom(roomCode.trim(), finalSeats);
      if (!res.roomCode || !res.seats) throw new Error("Could not join room");
      saveOwnedSeats(res.roomCode, res.seats);
      addMySeats(res.seats);
      router.push(`/room/${res.roomCode}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join room");
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 px-6 py-8">
      <h1 className="text-2xl font-extrabold">Join room</h1>

      <div>
        <label className="text-sm font-semibold text-ink-muted">Room code</label>
        <Input
          className="mt-2 text-center text-xl font-bold tracking-[0.3em] uppercase"
          placeholder="ABCDE"
          value={roomCode}
          maxLength={6}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
        />
      </div>

      <div>
        <label className="text-sm font-semibold text-ink-muted">Players on this device</label>
        <NumberPicker
          options={[1, 2, 3, 4]}
          value={seats.length}
          onChange={(n) => setSeats((prev) => defaultSeats(n, prev))}
        />
      </div>

      <div className="flex flex-col gap-3">
        {seats.map((seat, i) => (
          <SeatRow
            key={i}
            index={i}
            seat={seat}
            previewArmIndex={null}
            onChange={(next) => setSeats((prev) => prev.map((s, j) => (j === i ? next : s)))}
          />
        ))}
      </div>

      {error && <p className="text-sm text-accent">{error}</p>}

      <Button onClick={handleJoin} disabled={loading}>
        {loading ? "Joining…" : "Join room"}
      </Button>
    </div>
  );
}
