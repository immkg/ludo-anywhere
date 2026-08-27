"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useGame } from "@/hooks/useGame";
import { useGameStore } from "@/store/useGameStore";
import { useRoomStore } from "@/store/useRoomStore";
import {
  rollDice as emitRollDice,
  moveToken as emitMoveToken,
  suspendSeat,
  resumeSeat,
  removeSeat,
  transferHost,
  rematch,
} from "@/lib/socketActions";
import { colorForArm } from "@/game/board";
import { pickAutoMoveToken, moveToken as applyMoveToken, placementFor } from "@/game/engine";
import Dice from "@/components/game/Dice";
import DiceLabel from "@/components/game/DiceLabel";
import PlayerCorner from "@/components/game/PlayerCorner";
import Button from "@/components/ui/Button";
import IncomingJoinRequests from "@/components/lobby/IncomingJoinRequests";
import type { Room, Seat } from "@/types/room";
import type { GameState } from "@/types/game";

// Konva needs a real <canvas>/window, so this can't run during SSR.
const Board = dynamic(() => import("@/components/game/Board"), {
  ssr: false,
  loading: () => <div className="h-full w-full" />,
});

const AUTO_MOVE_MS = 15000;

export default function GameView({ room }: { room: Room }) {
  const router = useRouter();
  const { game, currentSeat, isMyTurn, validMoves } = useGame();
  const setGame = useGameStore((s) => s.setGame);
  const mySeats = useRoomStore((s) => s.mySeats);
  const isHost = !!room.hostSeatId && mySeats.some((s) => s.id === room.hostSeatId);
  const [isDiceRolling, setIsDiceRolling] = useState(false);
  const [managePlayersOpen, setManagePlayersOpen] = useState(false);
  const [rematchLoading, setRematchLoading] = useState(false);
  const [rematchError, setRematchError] = useState<string | null>(null);

  const handleRematch = async () => {
    setRematchLoading(true);
    setRematchError(null);
    try {
      // The new room's seats arrive via the room:rematchReady push (see
      // useSocketConnection), which navigates everyone in automatically —
      // this call itself doesn't need to do anything with its result.
      await rematch(room.code);
    } catch (e) {
      setRematchError(e instanceof Error ? e.message : "Could not start a rematch");
      setRematchLoading(false);
    }
  };

  // If a player doesn't tap a token in time, move one for them: prefer a
  // capture, then a move that lands safe, then the token furthest along
  // (closest to home). Resets whenever the game state actually changes
  // (a roll, a move) so it only ever fires after 15s of real inactivity.
  useEffect(() => {
    if (!isMyTurn || !currentSeat || !game || game.diceValue == null || validMoves.length === 0) {
      return;
    }
    const seatId = currentSeat.id;
    const roomCode = room.code;
    const timer = setTimeout(() => {
      const tokenIndex = pickAutoMoveToken(game, seatId);
      if (tokenIndex != null) emitMoveToken(roomCode, seatId, tokenIndex);
    }, AUTO_MOVE_MS);
    return () => clearTimeout(timer);
  }, [isMyTurn, currentSeat, game, validMoves, room.code]);

  if (!game) {
    return <div className="flex min-h-dvh items-center justify-center text-ink-muted">Loading game…</div>;
  }

  if (game.status === "finished") {
    // Up to 3 places (whoever actually finished, in order) plus whoever
    // never did — normally just the one natural loser, but a mid-game
    // removal (see Phase 4) can leave more than one seat unplaced, and
    // they all tie for last. See placementFor in src/game/engine.js.
    const describe = (seatId: string) => {
      const roomSeat = room.seats.find((s) => s.id === seatId);
      const gameSeat = game.seats.find((s) => s.id === seatId);
      const color = gameSeat ? colorForArm(gameSeat.armIndex) : null;
      return { seatId, name: roomSeat?.name ?? "A player", color };
    };
    const winners = game.placements.map((seatId, i) => ({ ...describe(seatId), rank: i + 1 }));
    const losers = game.seats.filter((s) => !game.placements.includes(s.id)).map((s) => describe(s.id));

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex min-h-dvh flex-col items-center justify-center gap-6 px-8 text-center"
      >
        <p className="text-ink-muted">Results</p>
        <div className="flex w-full max-w-xs flex-col gap-2">
          {winners.map((r) => (
            <div key={r.seatId} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
              <span className="w-5 shrink-0 text-lg font-extrabold text-ink-muted">{r.rank}</span>
              {r.color && <span className="h-8 w-8 shrink-0 rounded-full" style={{ backgroundColor: r.color.hex }} />}
              <span className="flex-1 truncate text-left font-semibold">{r.name}</span>
            </div>
          ))}
          {losers.map((r) => (
            <div
              key={r.seatId}
              className="flex items-center gap-3 rounded-2xl border border-dashed border-line p-3 opacity-70"
            >
              <span className="w-5 shrink-0 text-xs font-semibold text-ink-muted">Last</span>
              {r.color && <span className="h-8 w-8 shrink-0 rounded-full" style={{ backgroundColor: r.color.hex }} />}
              <span className="flex-1 truncate text-left font-semibold">{r.name}</span>
            </div>
          ))}
        </div>
        {rematchError && <p className="text-sm text-accent">{rematchError}</p>}
        {isHost && (
          <Button onClick={handleRematch} disabled={rematchLoading}>
            {rematchLoading ? "Starting…" : "Play again with same players"}
          </Button>
        )}
        <Button variant="secondary" onClick={() => router.push("/")}>
          Back home
        </Button>
      </motion.div>
    );
  }

  // Board corners: arm 0 = top-left, arm 1 = top-right, arm 2 = bottom-right,
  // arm 3 = bottom-left (see armForSeatIndex in src/game/board.js).
  const seatByArm = new Map<number, Seat>(room.seats.map((s) => [s.armIndex, s]));
  // A crown appears the moment a seat finishes, even while others keep
  // playing — null while the game is still deciding this seat's fate.
  const placementForArm = (seat: Seat | undefined) => (seat ? placementFor(game, seat.id) : null);
  const suspendedForArm = (seat: Seat | undefined) =>
    !!seat && !!game.seats.find((s) => s.id === seat.id)?.suspended;

  const canRoll = isMyTurn && game.diceValue == null;
  const canMove = isMyTurn && game.diceValue != null && validMoves.length > 0;

  const handleRoll = () => {
    if (!currentSeat || !canRoll) return;
    emitRollDice(room.code, currentSeat.id);
  };

  // Apply the move locally right away — engine.moveToken is the same pure,
  // deterministic function the server runs, so this renders the token's
  // motion instantly instead of waiting on a round trip. The emit still goes
  // out so the server (source of truth) can broadcast the authoritative
  // state, which silently reconciles anything that drifts (dropped socket
  // message, reconnect, etc).
  const handleTokenTap = (seatId: string, tokenIndex: number) => {
    setGame(applyMoveToken(game, seatId, tokenIndex));
    emitMoveToken(room.code, seatId, tokenIndex);
  };

  return (
    <div className="mx-auto flex h-dvh w-full flex-col gap-4 py-4">
      {isHost && (
        <div className="shrink-0 px-4">
          <IncomingJoinRequests roomCode={room.code} />
          <button
            onClick={() => setManagePlayersOpen(true)}
            className="text-xs font-semibold text-ink-muted underline"
          >
            Manage players
          </button>
        </div>
      )}
      {managePlayersOpen && (
        <ManagePlayersPanel room={room} game={game} onClose={() => setManagePlayersOpen(false)} />
      )}

      <div className="relative flex shrink-0 items-center justify-between px-4">
        <PlayerCorner
          seat={seatByArm.get(0) ?? null}
          avatarFirst
          isTurn={seatByArm.get(0)?.id === currentSeat?.id}
          placement={placementForArm(seatByArm.get(0))}
          suspended={suspendedForArm(seatByArm.get(0))}
        />
        {/* Absolutely centered so it never competes with the corners for
            row width — placed inline instead, a long name could squeeze its
            corner enough to wrap onto a second line. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <DiceLabel
            canRoll={canRoll}
            canMove={canMove}
            isRolling={isDiceRolling}
            color={currentSeat ? colorForArm(currentSeat.armIndex).hex : "#2B2016"}
          />
        </div>
        <PlayerCorner
          seat={seatByArm.get(1) ?? null}
          avatarFirst={false}
          isTurn={seatByArm.get(1)?.id === currentSeat?.id}
          placement={placementForArm(seatByArm.get(1))}
          suspended={suspendedForArm(seatByArm.get(1))}
        />
      </div>

      <div className="min-h-0 flex-1">
        <Board
          game={game}
          isMyTurn={isMyTurn}
          currentSeatId={currentSeat?.id ?? null}
          validMoves={validMoves}
          onTokenTap={handleTokenTap}
        />
      </div>

      {/* Konva draws to a <canvas>, which carries no semantics of its own,
          so screen readers need this separate text description of which
          tokens (if any) can currently be tapped. */}
      <p className="sr-only" aria-live="polite">
        {isMyTurn && validMoves.length > 0
          ? `Your turn: ${validMoves.length} token${validMoves.length === 1 ? "" : "s"} can move now.`
          : isMyTurn
            ? "Your turn: roll the dice."
            : ""}
      </p>

      <div className="relative flex min-h-16 shrink-0 items-center justify-between px-4">
        <PlayerCorner
          seat={seatByArm.get(3) ?? null}
          avatarFirst
          isTurn={seatByArm.get(3)?.id === currentSeat?.id}
          placement={placementForArm(seatByArm.get(3))}
          suspended={suspendedForArm(seatByArm.get(3))}
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="pointer-events-auto">
            <Dice
              lastRoll={game.lastRoll}
              rollSeq={game.rollSeq}
              canRoll={canRoll}
              onRoll={handleRoll}
              canMove={canMove}
              color={currentSeat ? colorForArm(currentSeat.armIndex).hex : "#2B2016"}
              onRollingChange={setIsDiceRolling}
            />
          </div>
        </div>
        <PlayerCorner
          seat={seatByArm.get(2) ?? null}
          avatarFirst={false}
          isTurn={seatByArm.get(2)?.id === currentSeat?.id}
          placement={placementForArm(seatByArm.get(2))}
          suspended={suspendedForArm(seatByArm.get(2))}
        />
      </div>
    </div>
  );
}

// Host-only mid-game controls: pause/resume/remove a seat, or hand off
// host. A won seat is untouchable; a removed one becomes claimable by
// someone else (see room:claimSeat) rather than offering any action here.
function ManagePlayersPanel({
  room,
  game,
  onClose,
}: {
  room: Room;
  game: GameState;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-surface p-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold">Manage players</p>
          <button onClick={onClose} className="text-sm font-semibold text-ink-muted underline">
            Close
          </button>
        </div>
        {room.seats.map((seat) => {
          const gameSeat = game.seats.find((s) => s.id === seat.id);
          const won = !!gameSeat?.finished && game.placements.includes(seat.id);
          const removed = !!gameSeat?.finished && !won;
          const suspended = !!gameSeat?.suspended;
          const isHostSeat = seat.id === room.hostSeatId;

          return (
            <div key={seat.id} className="flex items-center gap-2 rounded-2xl border border-line px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {seat.name}
                {isHostSeat && <span className="ml-1 text-xs font-normal text-ink-muted">(Host)</span>}
              </span>
              {won && <span className="text-xs text-ink-muted">Finished</span>}
              {removed && <span className="text-xs text-ink-muted">Removed</span>}
              {!won && !removed && (
                <>
                  <button
                    onClick={() =>
                      (suspended ? resumeSeat : suspendSeat)(room.code, seat.id).catch(() => {})
                    }
                    className="shrink-0 text-xs font-semibold text-accent underline"
                  >
                    {suspended ? "Resume" : "Pause"}
                  </button>
                  <button
                    onClick={() => removeSeat(room.code, seat.id).catch(() => {})}
                    className="shrink-0 text-xs font-semibold text-accent underline"
                  >
                    Remove
                  </button>
                  {!isHostSeat && seat.connected && !suspended && (
                    <button
                      onClick={() => transferHost(room.code, seat.id).catch(() => {})}
                      className="shrink-0 text-xs font-semibold text-ink-muted underline"
                    >
                      Make host
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
