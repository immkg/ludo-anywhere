"use client";

import { useRouter } from "next/navigation";
import { useNotificationsStore } from "@/store/useNotificationsStore";

// Mounted once near the app root (see SocketProvider) so a friend's room
// invite (pushed via the "room:invited" socket event) is visible no matter
// which page you're on.
export default function RoomInviteBanner() {
  const router = useRouter();
  const invites = useNotificationsStore((s) => s.roomInvites);
  const dismiss = useNotificationsStore((s) => s.dismissRoomInvite);

  if (invites.length === 0) return null;

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
            onClick={() => {
              dismiss(invite.id);
              router.push(`/join?code=${invite.roomCode}`);
            }}
            className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white"
          >
            Join
          </button>
          <button
            onClick={() => dismiss(invite.id)}
            className="shrink-0 text-xs font-semibold text-ink-muted underline"
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
