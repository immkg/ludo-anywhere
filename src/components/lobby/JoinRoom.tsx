"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { joinRoom, joinRoomAsGuest, requestToJoinRoom, claimSeat, type ClaimableSeat } from "@/lib/socketActions";
import { saveOwnedSeats, getGuestName, saveGuestName, randomFunnyName } from "@/lib/identity";
import { getSocket } from "@/lib/socket";
import { useRoomStore } from "@/store/useRoomStore";
import { useProfiles } from "@/hooks/useProfiles";
import { useFriends } from "@/hooks/useFriends";
import { usePresenceStore } from "@/store/usePresenceStore";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import FriendAvatar from "@/components/friends/FriendAvatar";
import { IconClock } from "@/components/lobby/icons";
import { cn } from "@/lib/utils";
import type { OwnedSeat } from "@/types/room";

export default function JoinRoom() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const addMySeats = useRoomStore((s) => s.addMySeats);
  const { profiles, loading: profilesLoading, createProfile } = useProfiles();

  const [roomCode, setRoomCode] = useState(() => searchParams.get("code")?.toUpperCase() ?? "");
  const [guestName, setGuestName] = useState(() => getGuestName());
  const [funnyName] = useState(() => randomFunnyName());
  const [loading, setLoading] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once room:join reports the room's already mid-game — nothing was
  // joined, this lists the paused/vacated seats a player could take over
  // instead (see room:claimSeat in server.js).
  const [claimable, setClaimable] = useState<ClaimableSeat[] | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  // Joining a room is always "join as me" — no separate player-picker step.
  // Resolves the profile that represents the signed-in account itself,
  // creating one from the Google name/email if this account has never
  // joined/created a room before.
  const resolveMyProfileId = async (): Promise<string> => {
    const myEmail = session?.user?.email?.toLowerCase();
    const existing = profiles.find((p) => p.email === myEmail);
    if (existing) return existing.id;
    if (!session?.user?.email) throw new Error("Sign in with Google to join a room");
    const created = await createProfile(session.user.name || "Player", session.user.email);
    return created.id;
  };

  const handleJoin = async () => {
    const code = roomCode.trim().toUpperCase();
    if (code.length < 4) {
      setError("Enter the room code");
      return;
    }
    const trimmedGuestName = guestName.trim() || `Guest ${funnyName}`;
    setLoading(true);
    setError(null);
    try {
      let res;
      if (session?.user) {
        const profileId = await resolveMyProfileId();
        res = await joinRoom(code, [{ profileId }]);
      } else {
        saveGuestName(trimmedGuestName);
        res = await joinRoomAsGuest(code, trimmedGuestName);
      }
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
    setClaimingId(seatId);
    setError(null);
    try {
      const profileId = await resolveMyProfileId();
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
    <main className="mx-auto flex w-full max-w-5xl flex-col px-5 py-6 sm:px-8 sm:py-10 lg:min-h-dvh lg:justify-center lg:px-10 lg:py-12">
      <div className="flex items-center gap-3">
        <Link
          href={session?.user ? "/" : "/play"}
          aria-label="Back to home"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-muted"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        {!claimable && !waiting && (
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/icon-join.png" alt="" aria-hidden className="hidden h-8 w-8 min-[390px]:block" />
            <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-4xl">Join Room</h1>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-8 md:mt-10 md:flex-row md:items-center md:gap-14 lg:gap-20">
        <div className="flex w-full max-w-md flex-1 flex-col gap-6">
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
              <button onClick={() => setClaimable(null)} className="self-start text-sm font-semibold text-ink-muted underline">
                Back
              </button>
            </div>
          ) : waiting ? (
            <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-line p-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-accent">
                <IconClock className="h-6 w-6" />
              </span>
              <p className="font-bold text-ink">Waiting for the host to approve…</p>
              <p className="text-sm text-ink-muted">
                They&rsquo;ll see your request the moment they&rsquo;re back in the app.
              </p>
              <button onClick={() => setWaiting(false)} className="text-sm font-semibold text-ink-muted underline">
                Cancel
              </button>
            </div>
          ) : (
            <>
              <div>
                <p className="mt-1.5 text-sm text-ink-muted sm:text-base">Enter a room code, or ask a friend.</p>
              </div>

              {friendsPlayingNow.length > 0 && (
                <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface-2 p-3.5 sm:p-4">
                  <p className="text-sm font-bold text-ink-muted">Friends playing now</p>
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

              {!session?.user && (
                <div className="flex flex-col gap-3 rounded-3xl border-2 border-line bg-surface p-4 sm:p-5">
                  <label htmlFor="guest-name" className="text-sm font-semibold text-ink-muted">
                    Your name
                  </label>
                  <Input
                    id="guest-name"
                    placeholder={funnyName}
                    value={guestName}
                    maxLength={20}
                    onChange={(e) => {
                      setGuestName(e.target.value);
                      setError(null);
                    }}
                  />
                </div>
              )}

              <div
                className={cn(
                  "flex flex-col gap-3 rounded-3xl border-2 bg-surface p-4 sm:p-5",
                  error ? "border-accent" : "border-accent/25"
                )}
              >
                <label htmlFor="room-code" className="text-sm font-semibold text-ink-muted">
                  Room code
                </label>
                <Input
                  id="room-code"
                  aria-invalid={!!error}
                  className="text-center text-2xl font-extrabold tracking-[0.3em] uppercase sm:text-3xl"
                  placeholder="ABCDE"
                  value={roomCode}
                  maxLength={6}
                  onChange={(e) => {
                    setRoomCode(e.target.value.toUpperCase());
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleJoin();
                  }}
                />
              </div>

              <div className="flex items-end justify-center gap-1 min-[390px]:gap-1.5 md:hidden" aria-hidden>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/pawn-blue.png" alt="" className="h-10 w-auto min-[390px]:h-14" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/pawn-yellow.png" alt="" className="h-10 w-auto min-[390px]:h-14" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/dice.png" alt="" className="mx-0.5 h-8 w-auto translate-y-1.5 min-[390px]:h-11" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/pawn-green.png" alt="" className="h-10 w-auto min-[390px]:h-14" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/pawn-red.png" alt="" className="h-10 w-auto min-[390px]:h-14" />
              </div>

              {error && (
                <div className="flex flex-col gap-3 rounded-2xl border-2 border-accent bg-accent/10 p-3.5 sm:p-4">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-white">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 8v5M12 16h.01" />
                      </svg>
                    </span>
                    <p className="text-sm font-bold text-accent">{error}</p>
                  </div>
                  <Link href="/create">
                    <Button variant="secondary" className="w-full">
                      Create Room Instead?
                    </Button>
                  </Link>
                </div>
              )}

              <Button onClick={handleJoin} disabled={loading || profilesLoading} className="w-full">
                <span className="flex w-full items-center justify-center gap-2">
                  {loading ? "Joining…" : "Join Room"}
                  {!loading && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  )}
                </span>
              </Button>
            </>
          )}
        </div>

        <div className="relative hidden shrink-0 md:flex md:w-[300px] md:justify-center lg:w-[380px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/hero-illustration.png"
            alt="Four players around a Ludo board"
            className="w-full max-w-[260px] object-contain lg:max-w-[320px]"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/star-yellow.png"
            alt=""
            aria-hidden
            className="absolute -left-1 top-2 h-6 w-6 opacity-90 lg:h-7 lg:w-7"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/cross-blue.png"
            alt=""
            aria-hidden
            className="absolute right-2 top-8 h-4 w-4 opacity-80 lg:right-4"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/star-red.png"
            alt=""
            aria-hidden
            className="absolute bottom-6 right-0 h-5 w-5 opacity-80 lg:right-2"
          />
        </div>
      </div>
    </main>
  );
}
