"use client";

import { useRouter } from "next/navigation";
import { useRoomStore } from "@/store/useRoomStore";
import Button from "@/components/ui/Button";
import { IconUsers } from "@/components/lobby/icons";

// "Active room" here is whatever useRoomStore already knows client-side —
// populated only once this device has actually joined a room this session
// (see RoomPageClient/CreateRoom). There's no server-side "my current room"
// lookup in this app, so a friend arriving fresh on /friends (no prior
// client-side room visit this session) simply won't see this banner — that
// matches every other page's knowledge of room state, not a regression.
export default function RoomReadyBanner() {
  const router = useRouter();
  const room = useRoomStore((s) => s.room);
  const mySeats = useRoomStore((s) => s.mySeats);

  const seated = !!room && room.status === "lobby" && mySeats.some((s) => room.seats.some((rs) => rs.id === s.id));
  if (!seated || !room) return null;

  return (
    <div className="flex items-center gap-3 rounded-3xl border border-accent/30 bg-accent/10 p-4 sm:gap-4 sm:p-5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/20 text-accent">
        <IconUsers className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold text-ink sm:text-base">Your room is ready</p>
        <p className="text-xs text-ink-muted sm:text-sm">Invite friends to join your game.</p>
      </div>
      <Button className="shrink-0 px-4 text-sm" onClick={() => router.push(`/room/${room.code}`)}>
        Invite friends
      </Button>
    </div>
  );
}
