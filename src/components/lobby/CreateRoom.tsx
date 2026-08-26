"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { armForSeatIndex } from "@/game/board";
import { createRoom } from "@/lib/socketActions";
import { saveOwnedSeats } from "@/lib/identity";
import { useRoomStore } from "@/store/useRoomStore";
import Button from "@/components/ui/Button";
import SeatRow, { type SeatDraft } from "@/components/lobby/SeatRow";

function defaultSeats(count: number, previous: SeatDraft[]): SeatDraft[] {
  return Array.from({ length: count }, (_, i) => previous[i] ?? { name: "" });
}

export default function CreateRoom() {
  const router = useRouter();
  const addMySeats = useRoomStore((s) => s.addMySeats);

  const [totalPlayers, setTotalPlayers] = useState(4);
  const [seats, setSeats] = useState<SeatDraft[]>(defaultSeats(1, []));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setSeatsOnDevice = (count: number) => {
    setSeats((prev) => defaultSeats(Math.min(count, totalPlayers), prev));
  };

  const handleTotalChange = (n: number) => {
    setTotalPlayers(n);
    setSeats((prev) => defaultSeats(Math.min(prev.length, n), prev));
  };

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const finalSeats = seats.map((s, i) => ({ name: s.name.trim() || `Player ${i + 1}` }));
      const res = await createRoom(totalPlayers, finalSeats);
      if (!res.roomCode || !res.seats) throw new Error("Could not create room");
      saveOwnedSeats(res.roomCode, res.seats);
      addMySeats(res.seats);
      router.push(`/room/${res.roomCode}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create room");
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 px-6 py-8">
      <h1 className="text-2xl font-extrabold">Create room</h1>

      <div>
        <label className="text-sm font-semibold text-ink-muted">Total players</label>
        <div className="mt-2 flex gap-2">
          {[2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              onClick={() => handleTotalChange(n)}
              className={`h-11 flex-1 rounded-xl border font-semibold ${
                totalPlayers === n ? "border-accent bg-accent text-white" : "border-line bg-surface"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm font-semibold text-ink-muted">Players on this device</label>
        <div className="mt-2 flex gap-2">
          {Array.from({ length: totalPlayers }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => setSeatsOnDevice(n)}
              className={`h-11 flex-1 rounded-xl border font-semibold ${
                seats.length === n ? "border-accent bg-accent text-white" : "border-line bg-surface"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {seats.map((seat, i) => (
          <SeatRow
            key={i}
            index={i}
            seat={seat}
            previewArmIndex={armForSeatIndex(i, totalPlayers)}
            onChange={(next) => setSeats((prev) => prev.map((s, j) => (j === i ? next : s)))}
          />
        ))}
      </div>

      {error && <p className="text-sm text-accent">{error}</p>}

      <Button onClick={handleCreate} disabled={loading}>
        {loading ? "Creating…" : "Create room"}
      </Button>
    </div>
  );
}
