"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { armForSeatIndex, colorForArm } from "@/game/board";
import { startGame, inviteFriendToRoom, removeSeat, joinRoom, trackShare, leaveRoom } from "@/lib/socketActions";
import { shareOnWhatsApp, roomJoinUrl } from "@/lib/share";
import { saveOwnedSeats, clearOwnedSeats } from "@/lib/identity";
import { useFriends } from "@/hooks/useFriends";
import { useProfiles } from "@/hooks/useProfiles";
import { usePresenceStore } from "@/store/usePresenceStore";
import { useRoomStore } from "@/store/useRoomStore";
import { useNotificationsStore } from "@/store/useNotificationsStore";
import { cn } from "@/lib/utils";
import Button from "@/components/ui/Button";
import FriendAvatar from "@/components/friends/FriendAvatar";
import Wordmark from "@/components/brand/Wordmark";
import AppIconMark from "@/components/brand/AppIconMark";
import SeatRow, { defaultSeats, type SeatDraft } from "@/components/lobby/SeatRow";
import IncomingJoinRequests from "@/components/lobby/IncomingJoinRequests";
import { OccupiedSeatCard, EmptySeatCard } from "@/components/lobby/PlayerSeatCard";
import {
  IconCheck,
  IconClock,
  IconCopy,
  IconExit,
  IconGlobe,
  IconGrid,
  IconLink,
  IconPlay,
  IconTrophy,
  IconUsers,
} from "@/components/lobby/icons";
import type { Room, OwnedSeat } from "@/types/room";

// Links into existing pages so the desktop shell's sidebar isn't a dead
// end — this component doesn't own those routes, it just points at them.
const NAV_ITEMS = [
  { href: "#", label: "Lobby", icon: IconGrid, active: true },
  { href: "/friends", label: "Friends", icon: IconUsers, active: false },
  { href: "/leaderboard", label: "Leaderboard", icon: IconTrophy, active: false },
  { href: "/history", label: "History", icon: IconClock, active: false },
];

export default function WaitingRoom({ room, mySeats }: { room: Room; mySeats: OwnedSeat[] }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [copied, setCopied] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  const error = useRoomStore((s) => s.error);
  const setError = useRoomStore((s) => s.setError);
  const resetRoomStore = useRoomStore((s) => s.reset);
  const isHost = !!room.hostSeatId && mySeats.some((s) => s.id === room.hostSeatId);
  const canStart = isHost && room.seats.length >= 2;
  const openSlots = Math.max(0, room.maxPlayers - room.seats.length);
  const hostName = room.seats.find((s) => s.id === room.hostSeatId)?.name;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable — the code is on-screen regardless
    }
  };

  const handleShareLink = () => {
    trackShare("room_shared", { roomCode: room.code });
    shareOnWhatsApp(`Join my Ludo room on MyLudo! ${roomJoinUrl(room.code)}`);
  };

  const handleLeave = () => {
    leaveRoom(room.code);
    clearOwnedSeats(room.code);
    resetRoomStore();
    router.push("/");
  };

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <AppIconMark className="h-7 w-7 sm:h-8 sm:w-8" />
          <Wordmark className="text-lg sm:text-xl" />
        </div>
        <div className="flex items-center gap-3">
          {session?.user && (
            <div className="hidden items-center gap-2 md:flex">
              {session.user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-9 w-9 shrink-0 rounded-full border border-line"
                />
              ) : (
                <span className="h-9 w-9 shrink-0 rounded-full border border-line bg-surface-2" />
              )}
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-bold text-ink">{session.user.name ?? session.user.email}</p>
                {isHost && <p className="text-xs font-semibold text-accent">Host</p>}
              </div>
            </div>
          )}
          <button
            onClick={handleLeave}
            className="flex h-11 items-center gap-1.5 rounded-full border border-line px-3 text-sm font-semibold text-ink-muted hover:border-accent/50 hover:text-accent md:px-4"
          >
            <IconExit className="h-4 w-4 shrink-0" />
            <span className="hidden md:inline">Leave Room</span>
          </button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl gap-6 px-5 pb-10 sm:px-6 lg:px-8">
        <aside className="hidden lg:flex lg:w-52 lg:shrink-0 lg:flex-col lg:gap-1 lg:pt-1">
          {NAV_ITEMS.map((item) =>
            item.active ? (
              <div
                key={item.label}
                aria-current="page"
                className="flex items-center gap-2.5 rounded-2xl bg-accent/12 px-3 py-2.5 text-sm font-bold text-accent"
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {item.label}
              </div>
            ) : (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm font-semibold text-ink-muted hover:bg-surface-2 hover:text-ink"
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            )
          )}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col gap-6 md:flex-row md:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-6 md:max-w-xl">
            <div className="flex items-center justify-between gap-3">
              {isHost ? (
                <Button disabled={!canStart} onClick={() => startGame(room.code, room.hostSeatId!)} className="flex-1">
                  <span className="flex items-center justify-center gap-2">
                    <IconPlay className="h-4 w-4" /> Start Game
                  </span>
                </Button>
              ) : (
                <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-muted">
                  <IconClock className="h-4 w-4 shrink-0" /> Waiting for host to start…
                </p>
              )}
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-sm font-bold text-ink">
                <IconUsers className="h-4 w-4 text-accent" />
                {room.seats.length}/{room.maxPlayers}
              </span>
            </div>
            {isHost && !canStart && (
              <p className="flex items-center gap-1.5 text-xs text-ink-muted">
                <IconClock className="h-3.5 w-3.5" /> Waiting for players…
              </p>
            )}

            {error && (
              <div className="flex items-start justify-between gap-3 rounded-2xl border border-accent bg-surface p-3">
                <p className="text-sm">
                  {error}
                  {error.includes("used up today") && (
                    <>
                      {" "}
                      <Link href="/pricing" className="font-semibold text-accent underline">
                        Get more games
                      </Link>
                    </>
                  )}
                </p>
                <button onClick={() => setError(null)} className="shrink-0 text-xs text-ink-muted underline">
                  Dismiss
                </button>
              </div>
            )}

            <div className="flex flex-col gap-3 rounded-3xl border-2 border-accent/25 bg-surface p-4 sm:p-5">
              <p className="text-sm text-ink-muted">Share this code with your friends</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="min-w-0 flex-1 rounded-2xl border border-line bg-surface-2 py-3 text-center text-3xl font-extrabold tracking-[0.25em] text-ink sm:text-4xl"
                >
                  {room.code}
                </button>
                <button
                  onClick={handleCopy}
                  aria-label={copied ? "Room code copied" : "Copy room code"}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface-2 text-ink-muted hover:text-accent"
                >
                  {copied ? <IconCheck className="h-5 w-5 text-accent" /> : <IconCopy className="h-5 w-5" />}
                </button>
              </div>

              {room.sponsored && !isHost && (
                <p className="text-xs font-semibold text-accent">
                  {hostName ?? "The host"} is hosting — this game&apos;s on them
                </p>
              )}

              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={handleShareLink}>
                  <span className="flex items-center justify-center gap-2">
                    <IconLink className="h-4 w-4" /> Share
                  </span>
                </Button>
                <Button variant="secondary" className="flex-1" onClick={() => setInviteOpen((v) => !v)}>
                  <span className="flex items-center justify-center gap-2">
                    <IconUsers className="h-4 w-4" /> Invite
                  </span>
                </Button>
              </div>

              {inviteOpen && <InviteFriends roomCode={room.code} />}
            </div>

            {isHost && <IncomingJoinRequests roomCode={room.code} />}

            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-bold text-ink-muted">
                Players ({room.seats.length}/{room.maxPlayers})
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {room.seats.map((seat) => {
                  const mine = mySeats.some((s) => s.id === seat.id);
                  // The host can remove anyone but themselves (down to
                  // hosting alone); a non-host device can only remove seats
                  // it added itself — see the matching check in
                  // room:removeSeat (server.js).
                  const canRemove = seat.id !== room.hostSeatId && (isHost || mine);
                  return (
                    <OccupiedSeatCard
                      key={seat.id}
                      seat={seat}
                      isMine={mine}
                      isHostSeat={seat.id === room.hostSeatId}
                      canRemove={canRemove}
                      onRemove={() => removeSeat(room.code, seat.id).catch(() => {})}
                    />
                  );
                })}
                {Array.from({ length: openSlots }, (_, i) => {
                  const arm = armForSeatIndex(room.seats.length + i, room.maxPlayers);
                  return (
                    <EmptySeatCard
                      key={i}
                      seatNumber={room.seats.length + i + 1}
                      previewColorHex={colorForArm(arm).hex}
                      onAdd={() => setAddPlayerOpen(true)}
                    />
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface-2 p-3 text-xs sm:text-sm">
              <IconGlobe className="h-5 w-5 shrink-0 text-ink-muted" />
              <p className="text-ink-muted">
                <span className="font-semibold text-ink">Anyone with the code can join</span> · from any device.
              </p>
            </div>
          </div>

          <div className="hidden shrink-0 items-start justify-center pt-2 md:flex md:w-[260px] lg:w-[320px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/hero-illustration.png"
              alt="A Ludo board set up for four players"
              className="w-full max-w-[260px] object-contain lg:max-w-[300px]"
            />
          </div>
        </main>
      </div>

      {addPlayerOpen && (
        <AddPlayerModal
          roomCode={room.code}
          seatedProfileIds={new Set(room.seats.map((s) => s.profileId).filter((id) => id != null))}
          onClose={() => setAddPlayerOpen(false)}
        />
      )}
    </div>
  );
}

// Lets any already-seated device add one more of its own profiles without
// leaving the lobby — reuses the same room:join path CreateRoom/JoinRoom
// use, just from inside WaitingRoom. The server still enforces everything
// (room not full, that profile not already seated elsewhere).
function AddPlayerModal({
  roomCode,
  seatedProfileIds,
  onClose,
}: {
  roomCode: string;
  seatedProfileIds: Set<string>;
  onClose: () => void;
}) {
  const addMySeats = useRoomStore((s) => s.addMySeats);
  const { profiles, createProfile } = useProfiles();
  const availableProfiles = profiles.filter((p) => !seatedProfileIds.has(p.id));
  const [seat, setSeat] = useState<SeatDraft>(defaultSeats(1, [])[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!seat.profileId) {
      setError("Pick a player");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await joinRoom(roomCode, [{ profileId: seat.profileId }]);
      if (!res.seats) throw new Error("Could not add player");
      saveOwnedSeats(roomCode, res.seats);
      addMySeats(res.seats);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add player");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-surface p-4">
        <div className="flex items-center justify-between">
          <p className="font-bold text-ink">Add a player</p>
          <button onClick={onClose} className="text-sm font-semibold text-ink-muted underline">
            Cancel
          </button>
        </div>
        {availableProfiles.length === 0 && (
          <p className="text-xs text-ink-muted">All your players are already in this room — add a new one below.</p>
        )}
        <SeatRow
          index={0}
          seat={seat}
          previewArmIndex={null}
          profiles={availableProfiles}
          onChange={setSeat}
          onCreateProfile={createProfile}
          showColorSwatch={false}
          placeholder="Select a player"
        />
        {error && <p className="text-xs text-accent">{error}</p>}
        <Button onClick={handleAdd} disabled={loading}>
          {loading ? "Adding…" : "Add player"}
        </Button>
      </div>
    </div>
  );
}

function InviteFriends({ roomCode }: { roomCode: string }) {
  const { friends, loading } = useFriends();
  const presence = usePresenceStore((s) => s.byUserId);
  const declinedInvites = useNotificationsStore((s) => s.declinedInvites);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

  if (loading) return null;

  const online = friends.filter((f) => presence[f.userId]?.online);
  if (online.length === 0) {
    return <p className="text-center text-xs text-ink-muted">No friends online right now.</p>;
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface-2 p-3">
      {online.map((friend) => {
        // Presence already tracks which room a friend is currently seated
        // in (see usePresenceStore/room:update's setUserRoom calls) — reuse
        // that instead of guessing from a local "I clicked invite" flag.
        const joined = presence[friend.userId]?.roomCode === roomCode;
        const declined = declinedInvites.some((d) => d.roomCode === roomCode && d.userId === friend.userId);
        const invited = invitedIds.has(friend.userId);
        const settled = joined || declined;
        const label = joined ? "Joined" : declined ? "Rejected" : invited ? "Invited" : "Invite";

        return (
          <div key={friend.userId} className="flex items-center gap-3">
            <FriendAvatar image={friend.image} />
            <p className="min-w-0 flex-1 truncate text-sm">{friend.name ?? friend.email}</p>
            <button
              disabled={settled || invited}
              onClick={() => {
                inviteFriendToRoom(roomCode, friend.userId).catch(() => {});
                setInvitedIds((prev) => new Set(prev).add(friend.userId));
              }}
              className={cn(
                "shrink-0 text-xs font-semibold",
                settled ? "text-ink-muted" : "text-accent underline disabled:text-ink-muted"
              )}
            >
              {label}
            </button>
          </div>
        );
      })}
    </div>
  );
}
