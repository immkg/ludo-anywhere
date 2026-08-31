"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useMotionValue } from "framer-motion";
import { createGame, rollDice, moveToken, getValidMoves, pickAutoMoveToken, placementFor } from "@/game/engine";
import { armForSeatIndex, colorForArm, YARD, finished as finishLine, trackSteps } from "@/game/board";
import { cn } from "@/lib/utils";
import Dice from "@/components/game/Dice";
import PlayerCorner from "@/components/game/PlayerCorner";
import Button from "@/components/ui/Button";
import NumberPicker from "@/components/ui/NumberPicker";
import type { GameState } from "@/types/game";
import type { Seat } from "@/types/room";

// Konva needs a real <canvas>/window, so this can't run during SSR.
const Board = dynamic(() => import("@/components/game/Board"), {
  ssr: false,
  loading: () => <div className="h-full w-full" />,
});

const AUTO_MOVE_MS = 15000;

function buildSeats(count: number): Seat[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `test-${i}`,
    name: `Player ${i + 1}`,
    armIndex: armForSeatIndex(i, count),
    deviceId: "test",
    connected: true,
    profileId: null,
  }));
}

function createTestSetup(count: number) {
  const seats = buildSeats(count);
  const game = createGame(seats.map((s) => ({ id: s.id, armIndex: s.armIndex })));
  return { seats, game };
}

// A local, server-less harness for the board + engine: it drives
// src/game/engine.js directly (no socket, no room, no auth) so the visuals
// and rules can be exercised solo, plus a few controls that reach past the
// engine's normal API to force state a real game can't easily reach on
// demand (an exact dice value, an arbitrary token position, an instant win).
export default function TestModeView() {
  const [{ seats, game }, setState] = useState(() => createTestSetup(4));
  const rollProgressMV = useMotionValue(0);

  const currentSeat = game.seats[game.currentSeatIndex] ?? null;
  const currentArm = currentSeat?.armIndex ?? null;

  // Mirrors GameView.tsx's diceArm fix: a roll can end the turn in the same
  // update it happened in (no legal move, three sixes, a lone auto-played
  // move), so `currentArm` alone would relocate the single shared <Dice/>
  // before its spin ever gets to play. See GameView.tsx for the full
  // rationale.
  const [lastSeenRoll, setLastSeenRoll] = useState<{ rollSeq: number; nextRollerArm: number } | null>(null);
  const [diceHoldArm, setDiceHoldArm] = useState<number | null>(null);
  if (!lastSeenRoll || lastSeenRoll.rollSeq !== game.rollSeq) {
    if (lastSeenRoll) setDiceHoldArm(lastSeenRoll.nextRollerArm);
    setLastSeenRoll({ rollSeq: game.rollSeq, nextRollerArm: currentArm ?? 0 });
  }
  useEffect(() => {
    if (diceHoldArm == null) return;
    const timer = setTimeout(() => setDiceHoldArm(null), 1500);
    return () => clearTimeout(timer);
  }, [diceHoldArm, game.rollSeq]);
  const diceArm = diceHoldArm ?? currentArm;

  const validMoves = currentSeat ? getValidMoves(game, currentSeat.id) : [];
  const canRoll = game.status === "playing" && game.diceValue == null;
  const canMove = game.status === "playing" && game.diceValue != null && validMoves.length > 0;
  const seatByArm = new Map<number, Seat>(seats.map((s) => [s.armIndex, s]));
  const nameFor = (seatId: string) => seats.find((s) => s.id === seatId)?.name ?? seatId;
  const placementForArm = (seat: Seat | undefined) => (seat ? placementFor(game, seat.id) : null);

  function updateGame(fn: (g: GameState) => GameState) {
    setState((s) => ({ ...s, game: fn(s.game) }));
  }

  function startNewGame(count: number) {
    setState(createTestSetup(count));
  }

  function handleRoll() {
    if (!canRoll) return;
    updateGame(rollDice);
  }

  // Mirrors GameView.tsx's own diceMount: a single Dice instance that
  // relocates next to whichever corner currently has the turn instead of
  // sitting in one fixed spot. Keyed off diceArm, not currentArm — see
  // diceArm above.
  const diceMount = diceArm != null && (
    <Dice
      lastRoll={game.lastRoll}
      rollSeq={game.rollSeq}
      canRoll={canRoll}
      onRoll={handleRoll}
      diceValue={game.diceValue}
      rollProgress={rollProgressMV}
      glowColor={currentSeat ? colorForArm(currentSeat.armIndex).hex : "#2B2016"}
    />
  );

  // Forces a specific face without touching engine.js: rollDice() draws its
  // number from Math.random(), so pinning that for the one call reuses the
  // real roll/forfeit/auto-play logic exactly instead of reimplementing it.
  function handleForceRoll(value: number) {
    if (!canRoll) return;
    const originalRandom = Math.random;
    Math.random = () => (value - 0.5) / 6;
    try {
      updateGame(rollDice);
    } finally {
      Math.random = originalRandom;
    }
  }

  function handleTokenTap(seatId: string, tokenIndex: number) {
    updateGame((g) => moveToken(g, seatId, tokenIndex));
  }

  function handleAutoMove() {
    if (!currentSeat) return;
    const tokenIndex = pickAutoMoveToken(game, currentSeat.id);
    if (tokenIndex != null) updateGame((g) => moveToken(g, currentSeat.id, tokenIndex));
  }

  function handleForceTurn(seatIndex: number) {
    updateGame((g) => ({ ...g, currentSeatIndex: seatIndex, diceValue: null, consecutiveSixes: 0 }));
  }

  function handleSetTokenPosition(seatIndex: number, tokenIndex: number, raw: number) {
    if (Number.isNaN(raw)) return;
    const clamped = Math.max(YARD, Math.min(finishLine(), Math.round(raw)));
    updateGame((g) => {
      const nextSeats = g.seats.map((seat, i) => {
        if (i !== seatIndex) return seat;
        const tokens = seat.tokens.map((pos, ti) => (ti === tokenIndex ? clamped : pos));
        return { ...seat, tokens, finished: tokens.every((p) => p === finishLine()) };
      });
      return { ...g, seats: nextSeats };
    });
  }

  // Mirrors moveToken's own finish/continue-play logic (see engine.js) —
  // duplicated here rather than reused because there's no legal roll that
  // reaches this state on demand, same reasoning as the rest of this file's
  // "reach past the engine's normal API" controls.
  function handleForceWin(seatIndex: number) {
    updateGame((g) => {
      const seats = g.seats.map((seat, i) =>
        i === seatIndex ? { ...seat, tokens: seat.tokens.map(() => finishLine()), finished: true } : seat
      );
      const winnerId = seats[seatIndex].id;
      const placements = g.placements.includes(winnerId) ? g.placements : [...g.placements, winnerId];
      const active = seats.filter((s) => !s.finished && !s.suspended).length;
      const anySuspended = seats.some((s) => s.suspended);
      if (active <= 1 && !anySuspended) {
        return { ...g, seats, placements, status: "finished", winnerSeatId: placements[0], diceValue: null };
      }
      return { ...g, seats, placements, diceValue: null };
    });
  }

  // Same auto-move-on-inactivity behavior GameView drives in real games, so
  // that flow (and its dice countdown ring) is exercisable here too.
  useEffect(() => {
    if (game.status !== "playing" || !currentSeat || game.diceValue == null || validMoves.length === 0) return;
    const seatId = currentSeat.id;
    const timer = setTimeout(() => {
      const tokenIndex = pickAutoMoveToken(game, seatId);
      if (tokenIndex != null) updateGame((g) => moveToken(g, seatId, tokenIndex));
    }, AUTO_MOVE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  return (
    <div className="mx-auto flex w-full flex-col">
      <div className="flex h-dvh w-full flex-col gap-2 overflow-hidden py-2">
        <div className="mx-4 flex shrink-0 items-center justify-between rounded-xl border border-dashed border-accent/60 bg-accent/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-accent">
          <span>Test mode — dev only</span>
          <Link href="/" className="underline">
            Home
          </Link>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3 px-4">
          <span className="text-sm text-ink-muted">Players</span>
          <NumberPicker options={[2, 3, 4]} value={seats.length} onChange={startNewGame} />
          <Button variant="secondary" onClick={() => startNewGame(seats.length)}>
            Reset
          </Button>
        </div>

        {game.status === "finished" && (
          <div className="mx-4 shrink-0 rounded-xl border border-line bg-surface-2 px-3 py-2 text-center text-sm font-semibold">
            {game.placements.map((id, i) => `${i + 1}. ${nameFor(id)}`).join(" · ")}
            {game.seats
              .filter((s) => !game.placements.includes(s.id))
              .map((s) => ` · Lost: ${nameFor(s.id)}`)
              .join("")}
          </div>
        )}

        <div className="relative flex shrink-0 items-center justify-between px-4">
          <PlayerCorner
            seat={seatByArm.get(0) ?? null}
            isTurn={seatByArm.get(0)?.id === currentSeat?.id}
            placement={placementForArm(seatByArm.get(0))}
            rollProgress={currentArm === 0 && canRoll ? rollProgressMV : undefined}
            canMove={currentArm === 0 && canMove}
            dice={diceArm === 0 ? diceMount : undefined}
          />
          <PlayerCorner
            seat={seatByArm.get(1) ?? null}
            isTurn={seatByArm.get(1)?.id === currentSeat?.id}
            placement={placementForArm(seatByArm.get(1))}
            rollProgress={currentArm === 1 && canRoll ? rollProgressMV : undefined}
            canMove={currentArm === 1 && canMove}
            dice={diceArm === 1 ? diceMount : undefined}
            diceFirst
          />
        </div>

        <div className="min-h-0 flex-1">
          <Board
            game={game}
            isMyTurn={game.status === "playing"}
            currentSeatId={currentSeat?.id ?? null}
            validMoves={validMoves}
            onTokenTap={handleTokenTap}
          />
        </div>

        <div className="relative flex min-h-16 shrink-0 items-center justify-between px-4">
          <PlayerCorner
            seat={seatByArm.get(3) ?? null}
            isTurn={seatByArm.get(3)?.id === currentSeat?.id}
            placement={placementForArm(seatByArm.get(3))}
            rollProgress={currentArm === 3 && canRoll ? rollProgressMV : undefined}
            canMove={currentArm === 3 && canMove}
            dice={diceArm === 3 ? diceMount : undefined}
          />
          <PlayerCorner
            seat={seatByArm.get(2) ?? null}
            isTurn={seatByArm.get(2)?.id === currentSeat?.id}
            placement={placementForArm(seatByArm.get(2))}
            rollProgress={currentArm === 2 && canRoll ? rollProgressMV : undefined}
            canMove={currentArm === 2 && canMove}
            dice={diceArm === 2 ? diceMount : undefined}
            diceFirst
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 pb-4">
        <div className="rounded-2xl border border-line bg-surface p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Force dice roll</p>
          <div className="grid grid-cols-6 gap-2">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                onClick={() => handleForceRoll(n)}
                disabled={!canRoll}
                className="h-10 rounded-lg border border-line bg-surface-2 font-semibold disabled:opacity-40"
              >
                {n}
              </button>
            ))}
          </div>
          <Button variant="secondary" className="mt-2 w-full" onClick={handleAutoMove} disabled={!canMove}>
            Auto-move now
          </Button>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Force turn</p>
          <div className="flex flex-wrap gap-2">
            {game.seats.map((seat, i) => (
              <button
                key={seat.id}
                onClick={() => handleForceTurn(i)}
                className={cn(
                  "h-9 rounded-lg border px-3 text-sm font-semibold",
                  i === game.currentSeatIndex ? "border-accent bg-accent text-white" : "border-line bg-surface-2"
                )}
              >
                {nameFor(seat.id)}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Force token positions</p>
          <div className="flex flex-col gap-3">
            {game.seats.map((seat, seatIndex) => (
              <div key={seat.id}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-semibold" style={{ color: colorForArm(seat.armIndex).hex }}>
                    {nameFor(seat.id)}
                  </span>
                  <button
                    onClick={() => handleForceWin(seatIndex)}
                    className="text-xs font-semibold text-accent underline"
                  >
                    Force win
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {seat.tokens.map((pos, tokenIndex) => (
                    <label key={tokenIndex} className="flex flex-col items-center gap-1 text-xs text-ink-muted">
                      T{tokenIndex + 1}
                      <input
                        type="number"
                        value={pos}
                        min={YARD}
                        max={finishLine()}
                        onChange={(e) => handleSetTokenPosition(seatIndex, tokenIndex, Number(e.target.value))}
                        className="w-full rounded-lg border border-line bg-surface-2 px-1 py-1 text-center text-sm text-ink"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-ink-muted">
            -1 = yard · 0–{trackSteps() - 1} = shared ring · {trackSteps()}–{finishLine() - 1} = home column ·{" "}
            {finishLine()} = finished
          </p>
        </div>

        <details className="rounded-2xl border border-line bg-surface p-3 text-xs">
          <summary className="cursor-pointer font-semibold uppercase tracking-wide text-ink-muted">
            Raw game state
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(game, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}
