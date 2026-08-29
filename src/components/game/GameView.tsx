"use client";

import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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
  endGame as emitEndGame,
  rematch,
  sendReaction,
} from "@/lib/socketActions";
import { getSocket } from "@/lib/socket";
import { colorForArm } from "@/game/board";
import { pickAutoMoveToken, moveToken as applyMoveToken, placementFor } from "@/game/engine";
import Dice, { type ThrowStyle } from "@/components/game/Dice";
import PlayerCorner from "@/components/game/PlayerCorner";
import ReactionBar from "@/components/game/ReactionBar";
import GameMenu from "@/components/game/GameMenu";
import type { Reaction } from "@/components/game/ReactionPicker";
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
const REACTION_DISPLAY_MS = 1600;

export default function GameView({ room }: { room: Room }) {
  const router = useRouter();
  const { game, currentSeat, isMyTurn, validMoves } = useGame();
  const setGame = useGameStore((s) => s.setGame);
  const mySeats = useRoomStore((s) => s.mySeats);
  const isHost = !!room.hostSeatId && mySeats.some((s) => s.id === room.hostSeatId);
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [rematchLoading, setRematchLoading] = useState(false);
  const [rematchError, setRematchError] = useState<string | null>(null);
  const [activeReaction, setActiveReaction] = useState<Reaction | null>(null);
  const reactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotion = useReducedMotion();

  // Geometry for the board square and the dice's "flick" throw (see
  // Dice.tsx), both measured live since either can change (viewport resize,
  // a player row's height changing, the host-only join-requests banner
  // appearing/disappearing above). Expressed in viewport pixels, so no
  // shared coordinate ancestor is needed — Dice only ever uses the
  // difference between two of them.
  //
  // The board area can't just be a flex-1 box around <Board/> (which
  // self-centers within whatever container it's given): in portrait, that
  // leaves the container far taller than the square Board actually draws,
  // pushing the player rows away from the board instead of hugging it. So
  // boardAreaRef (flex-1) and the two row refs measure the *true* leftover
  // space and each row's own height, boardSize is computed by subtracting
  // one from the other, and that exact pixel size is applied to
  // boardSlotRef directly — collapsing it to the square instead of
  // stretching to fill the leftover box. boardAreaRef's own
  // `justify-center` then centers the now-tightly-sized row+board+row
  // cluster as a whole, so any true surplus space lands outside it.
  const rootRef = useRef<HTMLDivElement>(null);
  const boardAreaRef = useRef<HTMLDivElement>(null);
  const topRowRef = useRef<HTMLDivElement>(null);
  const bottomRowRef = useRef<HTMLDivElement>(null);
  const boardSlotRef = useRef<HTMLDivElement>(null);
  const diceWrapRef = useRef<HTMLDivElement>(null);
  const [boardSize, setBoardSize] = useState<number | null>(null);
  const [diceGeometry, setDiceGeometry] = useState<{
    restPoint: { x: number; y: number };
    safeRegion: { left: number; top: number; size: number };
  } | null>(null);
  const [lastThrowStyle, setLastThrowStyle] = useState<ThrowStyle>("tap");
  const hasGame = Boolean(game);

  useLayoutEffect(() => {
    const areaEl = boardAreaRef.current;
    const topRowEl = topRowRef.current;
    const bottomRowEl = bottomRowRef.current;
    const diceEl = diceWrapRef.current;
    if (!areaEl || !topRowEl || !bottomRowEl || !diceEl) return;
    const recompute = () => {
      const areaRect = areaEl.getBoundingClientRect();
      const topRowHeight = topRowEl.getBoundingClientRect().height;
      const bottomRowHeight = bottomRowEl.getBoundingClientRect().height;
      const availableHeight = areaRect.height - topRowHeight - bottomRowHeight;
      if (areaRect.width <= 0 || availableHeight <= 0) return;
      const size = Math.min(areaRect.width, availableHeight);
      setBoardSize(size);

      // Derived analytically (not via a second getBoundingClientRect pass
      // on boardSlotRef) so the dice geometry is correct the same frame the
      // new boardSize is applied, rather than one render behind.
      const clusterHeight = topRowHeight + size + bottomRowHeight;
      const clusterTop = areaRect.top + (areaRect.height - clusterHeight) / 2;
      const boardTop = clusterTop + topRowHeight;
      const boardLeft = areaRect.left + (areaRect.width - size) / 2;
      const diceRect = diceEl.getBoundingClientRect();
      // An 80%-of-the-board square, centered, so a throw never lands flush
      // against the edge.
      const safeSize = size * 0.8;
      setDiceGeometry({
        restPoint: { x: diceRect.left + diceRect.width / 2, y: diceRect.top + diceRect.height / 2 },
        safeRegion: {
          left: boardLeft + (size - safeSize) / 2,
          top: boardTop + (size - safeSize) / 2,
          size: safeSize,
        },
      });
    };
    const observer = new ResizeObserver(recompute);
    observer.observe(areaEl);
    observer.observe(topRowEl);
    observer.observe(bottomRowEl);
    recompute();
    return () => observer.disconnect();
    // Re-attempts once `game` first becomes available: on initial load
    // `game` starts null (see the "Loading game…" branch below, which
    // renders without these refs at all), so the very first run of this
    // effect finds every ref unmounted and bails out; without this
    // dependency it would never run again once the real layout exists,
    // leaving boardSize/diceGeometry permanently null.
  }, [hasGame]);

  const showReaction = (reaction: Reaction) => {
    setActiveReaction(reaction);
    if (reactionTimerRef.current) clearTimeout(reactionTimerRef.current);
    reactionTimerRef.current = setTimeout(() => setActiveReaction(null), REACTION_DISPLAY_MS);
  };
  const handleReact = (reaction: Reaction) => {
    showReaction(reaction);
    sendReaction(room.code, reaction);
  };
  useEffect(() => () => {
    if (reactionTimerRef.current) clearTimeout(reactionTimerRef.current);
  }, []);

  // Reactions broadcast from other seats/spectators in the same room — the
  // sender already shows theirs locally via handleReact above, so this only
  // ever fires for reactions someone else sent (see game:reaction in
  // server.js, which relays to everyone but the sender).
  useEffect(() => {
    const socket = getSocket();
    const onIncoming = (reaction: Reaction) => {
      setActiveReaction(reaction);
      if (reactionTimerRef.current) clearTimeout(reactionTimerRef.current);
      reactionTimerRef.current = setTimeout(() => setActiveReaction(null), REACTION_DISPLAY_MS);
    };
    socket.on("game:reaction", onIncoming);
    return () => {
      socket.off("game:reaction", onIncoming);
    };
  }, []);

  // How the *next* rollSeq bump should animate (see Dice.tsx) — set
  // synchronously the instant this device triggers a roll (handleRoll
  // below), or relayed from whoever else triggered it (server.js's
  // game:diceThrow) so every viewer sees the same flourish.
  useEffect(() => {
    const socket = getSocket();
    const onThrowStyle = ({ style }: { style: ThrowStyle }) => setLastThrowStyle(style);
    socket.on("game:diceThrow", onThrowStyle);
    return () => {
      socket.off("game:diceThrow", onThrowStyle);
    };
  }, []);

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
        <p className="text-ink-muted">{game.endedEarly ? "Game ended early" : "Results"}</p>
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
              <span className="w-5 shrink-0 text-xs font-semibold text-ink-muted">
                {game.endedEarly ? "—" : "Last"}
              </span>
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

  const handleRoll = (style: ThrowStyle) => {
    if (!currentSeat || !canRoll) return;
    setLastThrowStyle(style);
    emitRollDice(room.code, currentSeat.id, style);
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
    <div ref={rootRef} className="mx-auto flex h-dvh w-full flex-col overflow-y-auto">
      {selectedSeatId && (
        <PlayerActionsModal
          room={room}
          game={game}
          seatId={selectedSeatId}
          onClose={() => setSelectedSeatId(null)}
        />
      )}
      {gameMenuOpen && <GameMenu roomCode={room.code} isHost={isHost} onClose={() => setGameMenuOpen(false)} />}

      {/* The game bar and dice bar stay pinned to the viewport's top/bottom
          edges (root scrolls instead of clipping, so sticky has a scroll
          context to stick within on short viewports); the player rows sit
          as ordinary flex siblings immediately against the board instead. */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-center border-b border-line bg-bg px-4 py-2">
        <ReactionBar onReact={handleReact} onMore={() => setGameMenuOpen(true)} />
      </div>

      {isHost && (
        <div className="shrink-0 px-4 pt-2">
          <IncomingJoinRequests roomCode={room.code} />
        </div>
      )}

      <div ref={boardAreaRef} className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <div ref={topRowRef} className="flex w-full shrink-0 items-center justify-between px-4 pb-2">
          <PlayerCorner
            seat={seatByArm.get(0) ?? null}
            avatarFirst
            isTurn={seatByArm.get(0)?.id === currentSeat?.id}
            placement={placementForArm(seatByArm.get(0))}
            suspended={suspendedForArm(seatByArm.get(0))}
            onClick={isHost && seatByArm.get(0) ? () => setSelectedSeatId(seatByArm.get(0)!.id) : undefined}
          />
          <PlayerCorner
            seat={seatByArm.get(1) ?? null}
            avatarFirst={false}
            isTurn={seatByArm.get(1)?.id === currentSeat?.id}
            placement={placementForArm(seatByArm.get(1))}
            suspended={suspendedForArm(seatByArm.get(1))}
            onClick={isHost && seatByArm.get(1) ? () => setSelectedSeatId(seatByArm.get(1)!.id) : undefined}
          />
        </div>

        <div
          ref={boardSlotRef}
          className="relative shrink-0 [container-type:size]"
          style={{ width: boardSize ?? undefined, height: boardSize ?? undefined }}
        >
          <Board
            game={game}
            isMyTurn={isMyTurn}
            currentSeatId={currentSeat?.id ?? null}
            validMoves={validMoves}
            onTokenTap={handleTokenTap}
          />
          <AnimatePresence>
            {activeReaction && (
              <motion.div
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                {activeReaction.kind === "emoji" ? (
                  <span className="text-[60cqmin] leading-none drop-shadow-lg">{activeReaction.value}</span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={activeReaction.src}
                    alt={activeReaction.alt}
                    className="h-[60cqmin] w-[60cqmin] object-contain drop-shadow-lg"
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
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

        <div ref={bottomRowRef} className="flex w-full shrink-0 items-center justify-between px-4 pt-2">
          <PlayerCorner
            seat={seatByArm.get(3) ?? null}
            avatarFirst
            isTurn={seatByArm.get(3)?.id === currentSeat?.id}
            placement={placementForArm(seatByArm.get(3))}
            suspended={suspendedForArm(seatByArm.get(3))}
            onClick={isHost && seatByArm.get(3) ? () => setSelectedSeatId(seatByArm.get(3)!.id) : undefined}
          />
          <PlayerCorner
            seat={seatByArm.get(2) ?? null}
            avatarFirst={false}
            isTurn={seatByArm.get(2)?.id === currentSeat?.id}
            placement={placementForArm(seatByArm.get(2))}
            suspended={suspendedForArm(seatByArm.get(2))}
            onClick={isHost && seatByArm.get(2) ? () => setSelectedSeatId(seatByArm.get(2)!.id) : undefined}
          />
        </div>
      </div>

      <div className="sticky bottom-0 z-10 flex shrink-0 items-center justify-center border-t border-line bg-bg px-4 py-2">
        <div ref={diceWrapRef}>
          <Dice
            lastRoll={game.lastRoll}
            rollSeq={game.rollSeq}
            canRoll={canRoll}
            onRoll={handleRoll}
            canMove={canMove}
            color={currentSeat ? colorForArm(currentSeat.armIndex).hex : "#2B2016"}
            restPoint={diceGeometry?.restPoint ?? null}
            safeRegion={diceGeometry?.safeRegion ?? null}
            diceValue={game.diceValue}
            throwStyle={lastThrowStyle}
          />
        </div>
      </div>
    </div>
  );
}

// Host-only mid-game controls for the one seat just tapped in the player
// row: pause/resume/remove, or hand off host. A won seat is untouchable;
// a removed one becomes claimable by someone else (see room:claimSeat)
// rather than offering any action here.
function PlayerActionsModal({
  room,
  game,
  seatId,
  onClose,
}: {
  room: Room;
  game: GameState;
  seatId: string;
  onClose: () => void;
}) {
  const seat = room.seats.find((s) => s.id === seatId);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [endGameLoading, setEndGameLoading] = useState(false);
  const [endGameError, setEndGameError] = useState<string | null>(null);
  if (!seat) return null;

  const gameSeat = game.seats.find((s) => s.id === seatId);
  const won = !!gameSeat?.finished && game.placements.includes(seatId);
  const removed = !!gameSeat?.finished && !won;
  const suspended = !!gameSeat?.suspended;
  const isHostSeat = seatId === room.hostSeatId;
  const color = gameSeat ? colorForArm(gameSeat.armIndex) : null;

  const handleEndGame = async () => {
    setEndGameLoading(true);
    setEndGameError(null);
    try {
      await emitEndGame(room.code);
      onClose();
    } catch (e) {
      setEndGameError(e instanceof Error ? e.message : "Could not end the game");
    } finally {
      setEndGameLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-surface p-4">
        <div className="flex items-center gap-2">
          {color && <span className="h-7 w-7 shrink-0 rounded-full" style={{ backgroundColor: color.hex }} />}
          <p className="min-w-0 flex-1 truncate font-semibold">
            {seat.name}
            {isHostSeat && <span className="ml-1 text-xs font-normal text-ink-muted">(Host)</span>}
          </p>
          <button onClick={onClose} className="shrink-0 text-sm font-semibold text-ink-muted underline">
            Close
          </button>
        </div>

        {isHostSeat ? (
          confirmingEnd ? (
            <>
              <p className="text-sm text-ink-muted">
                Play stops for everyone right away. It&rsquo;s saved to history but doesn&rsquo;t count as a
                win or loss for anyone who hasn&rsquo;t already finished.
              </p>
              {endGameError && <p className="text-sm text-accent">{endGameError}</p>}
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setConfirmingEnd(false)} disabled={endGameLoading}>
                  Cancel
                </Button>
                <Button onClick={handleEndGame} disabled={endGameLoading}>
                  {endGameLoading ? "Ending…" : "End game"}
                </Button>
              </div>
            </>
          ) : (
            <button
              onClick={() => setConfirmingEnd(true)}
              className="self-start rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-accent"
            >
              End game
            </button>
          )
        ) : (
          <>
            {won && <p className="text-sm text-ink-muted">Already finished — nothing to manage.</p>}
            {removed && <p className="text-sm text-ink-muted">Removed from this game.</p>}
            {!won && !removed && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => (suspended ? resumeSeat : suspendSeat)(room.code, seatId).catch(() => {})}
                  className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-accent"
                >
                  {suspended ? "Resume" : "Pause"}
                </button>
                <button
                  onClick={() => {
                    removeSeat(room.code, seatId).catch(() => {});
                    onClose();
                  }}
                  className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-accent"
                >
                  Remove
                </button>
                {seat.connected && !suspended && (
                  <button
                    onClick={() => transferHost(room.code, seatId).catch(() => {})}
                    className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-ink-muted"
                  >
                    Make host
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
