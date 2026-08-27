"use client";

import { useState } from "react";
import { colorForArm } from "@/game/board";
import {
  startGame,
  inviteFriendToRoom,
  approveJoinRequest,
  declineJoinRequest,
} from "@/lib/socketActions";
import { shareOnWhatsApp, roomJoinUrl } from "@/lib/share";
import { useFriends } from "@/hooks/useFriends";
import { usePresenceStore } from "@/store/usePresenceStore";
import { useNotificationsStore } from "@/store/useNotificationsStore";
import { useRoomStore } from "@/store/useRoomStore";
import Button from "@/components/ui/Button";
import FriendAvatar from "@/components/friends/FriendAvatar";
import Link from "next/link";
import type { Room } from "@/types/room";
import type { OwnedSeat } from "@/types/room";

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
          return (
            <div key={seat.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
              <span className="h-4 w-4 rounded-full" style={{ backgroundColor: color.hex }} />
              <span className="flex-1 font-medium">{seat.name}</span>
              {seat.id === room.hostSeatId && <span className="text-xs text-ink-muted">Host</span>}
              {mine && <span className="text-xs font-semibold text-accent">You</span>}
              {!seat.connected && <span className="text-xs text-ink-muted">Offline</span>}
            </div>
          );
        })}
        {Array.from({ length: openSlots }, (_, i) => (
          <div key={i} className="rounded-2xl border border-dashed border-line px-4 py-3 text-ink-muted">
            Waiting for player…
          </div>
        ))}
      </div>

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

function IncomingJoinRequests({ roomCode }: { roomCode: string }) {
  // Filtering happens outside the selector — a selector that returns a new
  // array each call defeats zustand's reference-equality check and loops.
  const allRequests = useNotificationsStore((s) => s.joinRequests);
  const removeJoinRequest = useNotificationsStore((s) => s.removeJoinRequest);
  const requests = allRequests.filter((r) => r.roomCode === roomCode);

  if (requests.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {requests.map((req) => (
        <div key={req.id} className="flex items-center gap-3 rounded-2xl border border-accent bg-surface p-3">
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">{req.fromName}</span> wants to join
          </p>
          <button
            onClick={() => {
              approveJoinRequest(roomCode, req.fromUserId).catch(() => {});
              removeJoinRequest(req.id);
            }}
            className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white"
          >
            Approve
          </button>
          <button
            onClick={() => {
              declineJoinRequest(roomCode, req.fromUserId);
              removeJoinRequest(req.id);
            }}
            className="shrink-0 text-xs font-semibold text-ink-muted underline"
          >
            Decline
          </button>
        </div>
      ))}
    </div>
  );
}
