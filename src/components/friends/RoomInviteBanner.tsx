"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { declineRoomInvite, joinRoom } from "@/lib/socketActions";
import { saveOwnedSeats } from "@/lib/identity";
import { useRoomStore } from "@/store/useRoomStore";
import { useNotificationsStore, type RoomInvite } from "@/store/useNotificationsStore";
import { useMyProfileId } from "@/hooks/useMyProfileId";

// Mounted once near the app root (see SocketProvider) so a friend's room
// invite (pushed via the "room:invited" socket event) is visible no matter
// which page you're on.
export default function RoomInviteBanner() {
  const router = useRouter();
  const invites = useNotificationsStore((s) => s.roomInvites);
  const dismiss = useNotificationsStore((s) => s.dismissRoomInvite);
  const addMySeats = useRoomStore((s) => s.addMySeats);
  const { resolve: resolveMyProfileId } = useMyProfileId();
  const [joiningId, setJoiningId] = useState<string | null>(null);

  if (invites.length === 0) return null;

  // Joins immediately and drops straight into the lobby — no detour
  // through the /join form, since the invite already names the exact
  // room. Approval-gated or already-mid-game joins fall back to /join,
  // which already has the waiting/claimable-seat UI for those.
  const handleJoin = async (invite: RoomInvite) => {
    setJoiningId(invite.id);
    try {
      const profileId = await resolveMyProfileId();
      const res = await joinRoom(invite.roomCode, [{ profileId }]);
      if (res.roomCode && res.seats) {
        saveOwnedSeats(res.roomCode, res.seats);
        addMySeats(res.seats);
        router.push(`/room/${res.roomCode}`);
      } else {
        router.push(`/join?code=${invite.roomCode}`);
      }
    } catch {
      router.push(`/join?code=${invite.roomCode}`);
    } finally {
      dismiss(invite.id);
      setJoiningId(null);
    }
  };

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex flex-col gap-2 p-3">
      {invites.map((invite) => (
        <div
          key={invite.id}
          className="mx-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-accent bg-surface p-3 shadow-lg"
        >
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">{invite.fromName}</span> invited you to a room
          </p>
          <button
            disabled={joiningId === invite.id}
            onClick={() => handleJoin(invite)}
            className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            {joiningId === invite.id ? "Joining…" : "Join"}
          </button>
          <button
            disabled={joiningId === invite.id}
            onClick={() => {
              declineRoomInvite(invite.roomCode, invite.fromUserId);
              dismiss(invite.id);
            }}
            className="shrink-0 text-xs font-semibold text-ink-muted underline disabled:opacity-40"
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
