"use client";

import { colorForArm } from "@/game/board";
import type { GameSeat } from "@/types/game";
import type { OwnedSeat, Seat } from "@/types/room";

type TurnBannerProps = {
  currentSeat: GameSeat | null;
  currentRoomSeat: Seat | null;
  isMyTurn: boolean;
  mySeats: OwnedSeat[];
};

export default function TurnBanner({ currentSeat, currentRoomSeat, isMyTurn, mySeats }: TurnBannerProps) {
  if (!currentSeat) return null;
  const color = colorForArm(currentSeat.armIndex);
  // A device holding multiple seats needs the actual name, not a generic
  // "Your turn" that doesn't say which of its own seats is up.
  const showsYou = isMyTurn && mySeats.length === 1;

  return (
    <div className="flex items-center justify-center gap-2 rounded-2xl bg-surface px-4 py-2 border border-line">
      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color.hex }} />
      <span className="font-semibold">
        {showsYou ? "Your turn" : `${currentRoomSeat?.name ?? "Waiting"}'s turn`}
      </span>
      {isMyTurn && mySeats.length > 1 && <span className="text-xs font-semibold text-accent">(you)</span>}
      {!currentRoomSeat?.connected && <span className="text-xs text-ink-muted">(disconnected)</span>}
    </div>
  );
}
