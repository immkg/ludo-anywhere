"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { joinRoom } from "@/lib/socketActions";
import { saveOwnedSeats } from "@/lib/identity";
import { useRoomStore } from "@/store/useRoomStore";
import { useProfiles } from "@/hooks/useProfiles";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import NumberPicker from "@/components/ui/NumberPicker";
import SeatRow, { defaultSeats, type SeatDraft } from "@/components/lobby/SeatRow";

export default function JoinRoom() {
  const router = useRouter();
  const { data: session } = useSession();
  const addMySeats = useRoomStore((s) => s.addMySeats);
  const { profiles, createProfile } = useProfiles();

  const [roomCode, setRoomCode] = useState("");
  const [seats, setSeats] = useState<SeatDraft[]>(defaultSeats(1, []));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (seats[0]?.profileId) return;
    const myEmail = session?.user?.email?.toLowerCase();
    const mine = profiles.find((p) => p.email === myEmail);
    if (mine) setSeats((prev) => prev.map((s, i) => (i === 0 ? { profileId: mine.id } : s)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, session?.user?.email]);

  const handleJoin = async () => {
    if (roomCode.trim().length < 4) {
      setError("Enter the room code");
      return;
    }
    if (seats.some((s) => !s.profileId)) {
      setError("Pick a player for every seat");
      return;
    }
    const profileIds = seats.map((s) => s.profileId);
    if (new Set(profileIds).size !== profileIds.length) {
      setError("Each player can only be seated once");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const finalSeats = seats.map((s) => ({ profileId: s.profileId as string }));
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
        {seats.map((seat, i) => {
          const takenElsewhere = new Set(
            seats.filter((_, j) => j !== i).map((s) => s.profileId)
          );
          return (
            <SeatRow
              key={i}
              index={i}
              seat={seat}
              previewArmIndex={null}
              profiles={profiles.filter((p) => !takenElsewhere.has(p.id))}
              onChange={(next) => setSeats((prev) => prev.map((s, j) => (j === i ? next : s)))}
              onCreateProfile={createProfile}
            />
          );
        })}
      </div>

      {error && <p className="text-sm text-accent">{error}</p>}

      <Button onClick={handleJoin} disabled={loading}>
        {loading ? "Joining…" : "Join room"}
      </Button>
    </div>
  );
}
