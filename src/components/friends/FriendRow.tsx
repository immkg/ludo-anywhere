"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatLastSeen } from "@/lib/time";
import { usePresenceStore } from "@/store/usePresenceStore";
import { useRoomStore } from "@/store/useRoomStore";
import { useNotificationsStore } from "@/store/useNotificationsStore";
import { useMyProfileId } from "@/hooks/useMyProfileId";
import { createRoom, inviteFriendToRoom } from "@/lib/socketActions";
import { saveOwnedSeats } from "@/lib/identity";
import FriendAvatar from "./FriendAvatar";
import PillButton from "./PillButton";
import { IconPlay } from "@/components/lobby/icons";
import { BLUE, GREEN } from "@/components/nav/navItems";
import type { Friend } from "@/types/friend";

export default function FriendRow({
  friend,
  onRemove,
}: {
  friend: Friend;
  onRemove: (friendshipId: string) => Promise<void>;
}) {
  const router = useRouter();
  const presence = usePresenceStore((s) => s.byUserId[friend.userId]);
  const room = useRoomStore((s) => s.room);
  const mySeats = useRoomStore((s) => s.mySeats);
  const addMySeats = useRoomStore((s) => s.addMySeats);
  const declinedInvites = useNotificationsStore((s) => s.declinedInvites);
  const { resolve: resolveMyProfileId } = useMyProfileId();

  const [invited, setInvited] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const online = presence?.online ?? false;
  const playing = online && !!presence?.roomCode;
  const statusLabel = playing ? "Playing" : online ? "Online now" : formatLastSeen(friend.lastSeenAt);

  // Only a room this device is actually seated in counts as "active" — see
  // RoomReadyBanner for why this is best-effort (client-only, no server
  // lookup exists for "my current room").
  const activeRoom =
    room && room.status === "lobby" && mySeats.some((s) => room.seats.some((rs) => rs.id === s.id)) ? room : null;

  const joined = activeRoom ? presence?.roomCode === activeRoom.code : false;
  const declined = activeRoom
    ? declinedInvites.some((d) => d.roomCode === activeRoom.code && d.userId === friend.userId)
    : false;

  const handleInvite = () => {
    if (!activeRoom) return;
    inviteFriendToRoom(activeRoom.code, friend.userId).catch(() => {});
    setInvited(true);
  };

  // No "Create Room" detour — this creates the 2-player room and sends
  // the live invite (same room:invite push WaitingRoom's own invite list
  // uses) in one go, then drops the host straight into the lobby to wait.
  const handleQuickPlay = async () => {
    setStarting(true);
    setStartError(null);
    try {
      const myProfileId = await resolveMyProfileId();
      const res = await createRoom(2, [{ profileId: myProfileId }]);
      if (!res.roomCode || !res.seats) throw new Error("Could not start a game");
      saveOwnedSeats(res.roomCode, res.seats);
      addMySeats(res.seats);
      inviteFriendToRoom(res.roomCode, friend.userId).catch(() => {});
      router.push(`/room/${res.roomCode}`);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "Could not start a game");
      setStarting(false);
    }
  };

  const handlePlay = () => {
    if (activeRoom) {
      handleInvite();
    } else {
      handleQuickPlay();
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await onRemove(friend.friendshipId);
    } finally {
      setRemoving(false);
    }
  };

  if (confirmRemove) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
        <FriendAvatar image={friend.image} size="md" />
        <p className="min-w-0 flex-1 truncate text-sm text-ink-muted">
          Remove {friend.name ?? friend.email} from your friends?
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            disabled={removing}
            onClick={handleRemove}
            className="min-h-11 rounded-full border border-line px-3 text-xs font-semibold text-ink-muted hover:text-ink disabled:opacity-40"
          >
            {removing ? "Removing…" : "Remove"}
          </button>
          <button
            onClick={() => setConfirmRemove(false)}
            className="min-h-11 rounded-full px-3 text-xs font-semibold text-ink-muted underline"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
        <span className="relative shrink-0">
          <FriendAvatar image={friend.image} size="md" />
          <span
            aria-hidden
            className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface"
            style={{ background: playing ? BLUE : online ? GREEN : "var(--color-line)" }}
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">{friend.name ?? friend.email}</p>
          <p className="truncate text-xs text-ink-muted">{statusLabel}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Offline friends get no Play/Invite action — there's nothing
              useful to invite them into right now, only the option to
              remove them. */}
          {online &&
            (activeRoom && (joined || declined || invited) ? (
              <PillButton tone="neutral" className="shrink-0" disabled>
                {joined ? "Joined" : declined ? "Declined" : "Invited"}
              </PillButton>
            ) : (
              <PillButton
                color={GREEN}
                className="shrink-0"
                onClick={handlePlay}
                disabled={starting}
                icon={!starting ? <IconPlay className="h-3 w-3" /> : undefined}
              >
                {starting ? "Starting…" : "Play"}
              </PillButton>
            ))}
          <button
            onClick={() => setConfirmRemove(true)}
            aria-label={`Remove ${friend.name ?? friend.email ?? "friend"}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:text-ink"
          >
            <span aria-hidden className="text-base leading-none">
              &hellip;
            </span>
          </button>
        </div>
      </div>
      {startError && <p className="px-1 text-xs text-accent">{startError}</p>}
    </div>
  );
}
