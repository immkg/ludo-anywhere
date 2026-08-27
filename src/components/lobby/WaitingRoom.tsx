"use client";

import { useState } from "react";
import { colorForArm } from "@/game/board";
import { startGame, inviteFriendToRoom, removeSeat, joinRoom } from "@/lib/socketActions";
import { shareOnWhatsApp, roomJoinUrl } from "@/lib/share";
import { saveOwnedSeats } from "@/lib/identity";
import { useFriends } from "@/hooks/useFriends";
import { useProfiles } from "@/hooks/useProfiles";
import { usePresenceStore } from "@/store/usePresenceStore";
import { useRoomStore } from "@/store/useRoomStore";
import Button from "@/components/ui/Button";
import FriendAvatar from "@/components/friends/FriendAvatar";
import SeatRow, { defaultSeats, type SeatDraft } from "@/components/lobby/SeatRow";
import IncomingJoinRequests from "@/components/lobby/IncomingJoinRequests";
import Link from "next/link";
import type { Room } from "@/types/room";
import type { OwnedSeat } from "@/types/room";

// A room always needs at least a host and one opponent — mirrors the
// floor enforced server-side in src/server/rooms.js's removeSeat().
const MIN_PLAYERS = 2;

export default function WaitingRoom({ room, mySeats }: { room: Room; mySeats: OwnedSeat[] }) {
  const [copied, setCopied] = useState(false);
  const error = useRoomStore((s) => s.error);
  const setError = useRoomStore((s) => s.setError);
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

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 px-6 py-8">
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

      <div className="text-center">
        <p className="text-sm text-ink-muted">Room code</p>
        <button onClick={handleCopy} className="text-4xl font-extrabold tracking-[0.2em]">
          {room.code}
        </button>
        <p className="mt-1 text-xs text-ink-muted">{copied ? "Copied!" : "Tap to copy and share"}</p>
        {room.sponsored && !isHost && (
          <p className="mt-1 text-xs font-semibold text-accent">
            {hostName ?? "The host"} is hosting — this game&apos;s on them
          </p>
        )}
        <button
          onClick={() => shareOnWhatsApp(`Join my Ludo room! ${roomJoinUrl(room.code)}`)}
          className="mt-2 text-xs font-semibold text-accent underline"
        >
          Share on WhatsApp
        </button>
      </div>

      {isHost && <IncomingJoinRequests roomCode={room.code} />}

      <div className="flex flex-col gap-2">
        {room.seats.map((seat) => {
          const mine = mySeats.some((s) => s.id === seat.id);
          const color = colorForArm(seat.armIndex);
          const canRemove = isHost && seat.id !== room.hostSeatId && room.seats.length > MIN_PLAYERS;
          return (
            <div key={seat.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
              <span className="h-4 w-4 rounded-full" style={{ backgroundColor: color.hex }} />
              <span className="flex-1 font-medium">{seat.name}</span>
              {seat.id === room.hostSeatId && <span className="text-xs text-ink-muted">Host</span>}
              {mine && <span className="text-xs font-semibold text-accent">You</span>}
              {!seat.connected && <span className="text-xs text-ink-muted">Offline</span>}
              {canRemove && (
                <button
                  onClick={() => removeSeat(room.code, seat.id).catch(() => {})}
                  aria-label={`Remove ${seat.name}`}
                  className="shrink-0 text-ink-muted hover:text-accent"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
        {Array.from({ length: openSlots }, (_, i) => (
          <div key={i} className="rounded-2xl border border-dashed border-line px-4 py-3 text-ink-muted">
            Waiting for player…
          </div>
        ))}
      </div>

      {openSlots > 0 && <AddPlayer roomCode={room.code} />}
      {openSlots > 0 && <InviteFriends roomCode={room.code} />}

      {isHost ? (
        <Button disabled={!canStart} onClick={() => startGame(room.code, room.hostSeatId!)}>
          {room.seats.length < 2 ? "Need at least 2 players" : "Start game"}
        </Button>
      ) : (
        <p className="text-center text-ink-muted">Waiting for the host to start…</p>
      )}
    </div>
  );
}

// Lets any already-seated device add one more of its own profiles without
// leaving the lobby — reuses the same room:join path CreateRoom/JoinRoom
// use, just from inside WaitingRoom. The server still enforces everything
// (room not full, that profile not already seated elsewhere).
function AddPlayer({ roomCode }: { roomCode: string }) {
  const addMySeats = useRoomStore((s) => s.addMySeats);
  const { profiles, createProfile } = useProfiles();
  const [open, setOpen] = useState(false);
  const [seat, setSeat] = useState<SeatDraft>(defaultSeats(1, [])[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm font-semibold text-accent underline">
        + Add another player
      </button>
    );
  }

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
      setOpen(false);
      setSeat({ profileId: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add player");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
      <SeatRow
        index={0}
        seat={seat}
        previewArmIndex={null}
        profiles={profiles}
        onChange={setSeat}
        onCreateProfile={createProfile}
      />
      {error && <p className="text-xs text-accent">{error}</p>}
      <div className="flex items-center gap-4">
        <button
          onClick={handleAdd}
          disabled={loading}
          className="text-sm font-semibold text-accent disabled:opacity-40"
        >
          {loading ? "Adding…" : "Add player"}
        </button>
        <button onClick={() => setOpen(false)} className="text-sm font-semibold text-ink-muted underline">
          Cancel
        </button>
      </div>
    </div>
  );
}

function InviteFriends({ roomCode }: { roomCode: string }) {
  const { friends, loading } = useFriends();
  const presence = usePresenceStore((s) => s.byUserId);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

  if (loading || friends.length === 0) return null;

  const online = friends.filter((f) => presence[f.userId]?.online);
  if (online.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
      <p className="text-sm font-semibold text-ink-muted">Invite friends</p>
      {online.map((friend) => (
        <div key={friend.userId} className="flex items-center gap-3">
          <FriendAvatar image={friend.image} />
          <p className="min-w-0 flex-1 truncate text-sm">{friend.name ?? friend.email}</p>
          <button
            disabled={invitedIds.has(friend.userId)}
            onClick={() => {
              inviteFriendToRoom(roomCode, friend.userId).catch(() => {});
              setInvitedIds((prev) => new Set(prev).add(friend.userId));
            }}
            className="shrink-0 text-xs font-semibold text-accent underline disabled:text-ink-muted"
          >
            {invitedIds.has(friend.userId) ? "Invited" : "Invite"}
          </button>
        </div>
      ))}
    </div>
  );
}
