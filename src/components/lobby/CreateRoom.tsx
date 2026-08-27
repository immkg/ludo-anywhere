"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { armForSeatIndex } from "@/game/board";
import { createRoom } from "@/lib/socketActions";
import { saveOwnedSeats } from "@/lib/identity";
import { useRoomStore } from "@/store/useRoomStore";
import { useProfiles } from "@/hooks/useProfiles";
import Button from "@/components/ui/Button";
import NumberPicker from "@/components/ui/NumberPicker";
import SeatRow, { defaultSeats, type SeatDraft } from "@/components/lobby/SeatRow";
import type { EntitlementStatus } from "@/types/billing";

export default function CreateRoom() {
  const router = useRouter();
  const { data: session } = useSession();
  const addMySeats = useRoomStore((s) => s.addMySeats);
  const { profiles, createProfile } = useProfiles();

  const [totalPlayers, setTotalPlayers] = useState(4);
  const [seats, setSeats] = useState<SeatDraft[]>(defaultSeats(1, []));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billing, setBilling] = useState<EntitlementStatus | null>(null);

  useEffect(() => {
    fetch("/api/billing/status")
      .then((res) => res.json())
      .then(setBilling)
      .catch(() => {});
  }, []);

  // Only a hard signal (no free slot, no credit, no active plan) blocks the
  // button — this is a pre-check, the real charge happens server-side at
  // game:start. The free allowance is flat (any player count), so it
  // doesn't depend on totalPlayers.
  const blocked = !!billing && !billing.entitlement && billing.creditsRemaining <= 0 && billing.freeRemaining <= 0;

  // The device-login's own profile (created automatically on sign-in) is
  // almost always one of the players, so default seat 1 to it.
  useEffect(() => {
    if (seats[0]?.profileId) return;
    const myEmail = session?.user?.email?.toLowerCase();
    const mine = profiles.find((p) => p.email === myEmail);
    if (mine) setSeats((prev) => prev.map((s, i) => (i === 0 ? { profileId: mine.id } : s)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, session?.user?.email]);

  const setSeatsOnDevice = (count: number) => {
    setSeats((prev) => defaultSeats(Math.min(count, totalPlayers), prev));
  };

  const handleTotalChange = (n: number) => {
    setTotalPlayers(n);
    setSeats((prev) => defaultSeats(Math.min(prev.length, n), prev));
  };

  const handleCreate = async () => {
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Create room</h1>
        <Link href="/" className="text-sm font-semibold text-ink-muted underline">
          Home
        </Link>
      </div>

      <div>
        <label className="text-sm font-semibold text-ink-muted">Total players</label>
        <NumberPicker options={[2, 3, 4]} value={totalPlayers} onChange={handleTotalChange} />
        {billing && (
          <p className="mt-1 text-xs text-ink-muted">
            {billing.entitlement
              ? "Unlimited"
              : billing.creditsRemaining > 0
                ? `${billing.creditsRemaining} credits left`
                : `${billing.freeRemaining} free today`}
          </p>
        )}
      </div>

      <div>
        <label className="text-sm font-semibold text-ink-muted">Players on this device</label>
        <NumberPicker
          options={Array.from({ length: totalPlayers }, (_, i) => i + 1)}
          value={seats.length}
          onChange={setSeatsOnDevice}
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
              previewArmIndex={armForSeatIndex(i, totalPlayers)}
              profiles={profiles.filter((p) => !takenElsewhere.has(p.id))}
              onChange={(next) => setSeats((prev) => prev.map((s, j) => (j === i ? next : s)))}
              onCreateProfile={createProfile}
            />
          );
        })}
      </div>

      {error && <p className="text-sm text-accent">{error}</p>}

      {blocked ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-accent bg-surface p-4 text-center">
          <p className="text-sm">You&rsquo;ve used today&rsquo;s free games.</p>
          <Link href="/pricing">
            <Button className="w-full">Get more games</Button>
          </Link>
        </div>
      ) : (
        <Button onClick={handleCreate} disabled={loading}>
          {loading ? "Creating…" : "Create room"}
        </Button>
      )}
    </div>
  );
}
