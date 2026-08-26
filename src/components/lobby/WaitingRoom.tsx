"use client";

import { useState } from "react";
import { colorForArm } from "@/game/board";
import { startGame } from "@/lib/socketActions";
import Button from "@/components/ui/Button";
import type { Room } from "@/types/room";
import type { OwnedSeat } from "@/types/room";

export default function WaitingRoom({ room, mySeats }: { room: Room; mySeats: OwnedSeat[] }) {
  const [copied, setCopied] = useState(false);
  const isHost = !!room.hostSeatId && mySeats.some((s) => s.id === room.hostSeatId);
  const canStart = isHost && room.seats.length >= 2;
  const openSlots = Math.max(0, room.maxPlayers - room.seats.length);

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
      <div className="text-center">
        <p className="text-sm text-ink-muted">Room code</p>
        <button onClick={handleCopy} className="text-4xl font-extrabold tracking-[0.2em]">
          {room.code}
        </button>
        <p className="mt-1 text-xs text-ink-muted">{copied ? "Copied!" : "Tap to copy and share"}</p>
      </div>

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
