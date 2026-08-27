"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { joinRoom, requestToJoinRoom, claimSeat, type ClaimableSeat } from "@/lib/socketActions";
import { saveOwnedSeats } from "@/lib/identity";
import { getSocket } from "@/lib/socket";
import { useRoomStore } from "@/store/useRoomStore";
import { useProfiles } from "@/hooks/useProfiles";
import { useFriends } from "@/hooks/useFriends";
import { usePresenceStore } from "@/store/usePresenceStore";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import NumberPicker from "@/components/ui/NumberPicker";
import SeatRow, { defaultSeats, type SeatDraft } from "@/components/lobby/SeatRow";
import FriendAvatar from "@/components/friends/FriendAvatar";
import type { OwnedSeat } from "@/types/room";

export default function JoinRoom() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const addMySeats = useRoomStore((s) => s.addMySeats);
  const { profiles, createProfile } = useProfiles();

  const [roomCode, setRoomCode] = useState(() => searchParams.get("code")?.toUpperCase() ?? "");
  const [seats, setSeats] = useState<SeatDraft[]>(defaultSeats(1, []));
  const [loading, setLoading] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once room:join reports the room's already mid-game — nothing was
  // joined, this lists the paused/vacated seats a player could take over
  // instead (see room:claimSeat in server.js).
  const [claimable, setClaimable] = useState<ClaimableSeat[] | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);

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
      // A brand-new account's join needs host approval — see room:join in
      // server.js. The eventual result arrives later via the same
      // room:joinApproved/room:joinRequest:declined listeners below that
      // already handle "Ask to join".
      if (res.pending) {
        setWaiting(true);
        setLoading(false);
        return;
      }
      if (res.midGame) {
        setClaimable(res.claimableSeats ?? []);
        setLoading(false);
        return;
      }
      if (!res.roomCode || !res.seats) throw new Error("Could not join room");
      saveOwnedSeats(res.roomCode, res.seats);
      addMySeats(res.seats);
      router.push(`/room/${res.roomCode}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join room");
      setLoading(false);
    }
  };

  const handleClaim = async (seatId: string) => {
    const profileId = seats[0]?.profileId;
    if (!profileId) return;
    setClaimingId(seatId);
    setError(null);
    try {
      const res = await claimSeat(roomCode.trim(), seatId, profileId);
      if (res.pending) {
        setClaimable(null);
        setWaiting(true);
        return;
      }
      if (!res.roomCode || !res.seats) throw new Error("Could not join that seat");
      saveOwnedSeats(res.roomCode, res.seats);
      addMySeats(res.seats);
      router.push(`/room/${res.roomCode}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join that seat");
    } finally {
      setClaimingId(null);
    }
  };

  const { friends } = useFriends();
  const presence = usePresenceStore((s) => s.byUserId);
  const [askingUserId, setAskingUserId] = useState<string | null>(null);

  // The requester never types anything for this flow — the host approves
  // with just their own profile (see room:joinRequest:approve in
  // server.js), so the result/decline is a one-off push tied to whichever
  // request is currently pending, not a store other pages need.
  useEffect(() => {
    const socket = getSocket();
    const onApproved = ({ roomCode: approvedCode, seats: approvedSeats }: { roomCode: string; seats: OwnedSeat[] }) => {
      saveOwnedSeats(approvedCode, approvedSeats);
      addMySeats(approvedSeats);
      router.push(`/room/${approvedCode}`);
    };
    const onDeclined = () => {
      setAskingUserId(null);
      setWaiting(false);
      setError("The host declined your request to join");
    };
    socket.on("room:joinApproved", onApproved);
    socket.on("room:joinRequest:declined", onDeclined);
    return () => {
      socket.off("room:joinApproved", onApproved);
      socket.off("room:joinRequest:declined", onDeclined);
    };
  }, [router, addMySeats]);

  const handleAskToJoin = async (friendUserId: string, friendRoomCode: string) => {
    setAskingUserId(friendUserId);
    setError(null);
    try {
      await requestToJoinRoom(friendRoomCode);
    } catch (e) {
      setAskingUserId(null);
      setError(e instanceof Error ? e.message : "Could not send request");
    }
  };

  const friendsPlayingNow = friends.filter((f) => presence[f.userId]?.online && presence[f.userId]?.roomCode);

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Join room</h1>
        <Link href="/" className="text-sm font-semibold text-ink-muted underline">
          Home
        </Link>
      </div>

      {claimable ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm font-semibold text-ink-muted">
            That game&rsquo;s already in progress
            {claimable.length > 0 ? " — but you can take over an open seat:" : "."}
          </p>
          {claimable.length === 0 ? (
            <p className="text-sm text-ink-muted">No seats are open to join right now.</p>
          ) : (
            claimable.map((seat) => (
              <button
                key={seat.id}
                disabled={claimingId === seat.id}
                onClick={() => handleClaim(seat.id)}
                className="rounded-2xl border border-line bg-surface-2 px-4 py-3 text-left font-medium disabled:opacity-40"
              >
                {claimingId === seat.id ? "Joining…" : `Take over ${seat.name}’s seat`}
              </button>
            ))
          )}
          <button onClick={() => setClaimable(null)} className="text-sm font-semibold text-ink-muted underline">
            Back
          </button>
        </div>
      ) : waiting ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line p-6 text-center">
          <p className="font-semibold">Waiting for the host to approve…</p>
          <p className="text-sm text-ink-muted">
            They&rsquo;ll see your request the moment they&rsquo;re back in the app.
          </p>
          <button
            onClick={() => setWaiting(false)}
            className="text-sm font-semibold text-ink-muted underline"
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
      {friendsPlayingNow.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm font-semibold text-ink-muted">Friends playing now</p>
          {friendsPlayingNow.map((friend) => (
            <div key={friend.userId} className="flex items-center gap-3">
              <FriendAvatar image={friend.image} />
              <p className="min-w-0 flex-1 truncate text-sm">{friend.name ?? friend.email}</p>
              <button
                disabled={askingUserId === friend.userId}
                onClick={() => handleAskToJoin(friend.userId, presence[friend.userId]!.roomCode!)}
                className="shrink-0 text-xs font-semibold text-accent underline disabled:text-ink-muted"
              >
                {askingUserId === friend.userId ? "Waiting…" : "Ask to join"}
              </button>
            </div>
          ))}
        </div>
      )}

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
        </>
      )}
    </div>
  );
}
