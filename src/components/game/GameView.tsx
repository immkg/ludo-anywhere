"use client";

import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  AnimatePresence,
  motion,
  useAnimationControls,
  useMotionValue,
  useReducedMotion,
} from "framer-motion";
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
  leaveRoom,
  rematch,
  sendReaction,
} from "@/lib/socketActions";
import { clearOwnedSeats } from "@/lib/identity";
import { getSocket } from "@/lib/socket";
import { colorForArm, buildBoardLayout } from "@/game/board";
import { moveToken as applyMoveToken, placementFor, DICE_HOLD_MS, timeoutsForLevel } from "@/game/engine";
import Dice, { type ThrowStyle } from "@/components/game/Dice";
import { arcKeyframes, playSettleBounces, randomBetween, type Point } from "@/lib/diceMotion";
import PlayerCorner from "@/components/game/PlayerCorner";
import ReactionBar from "@/components/game/ReactionBar";
import GameMenu from "@/components/game/GameMenu";
import ShareInviteButton from "@/components/nav/ShareInviteButton";
import FeedbackPrompt from "@/components/game/FeedbackPrompt";
import DiscountSplash from "@/components/game/DiscountSplash";
import {
  evaluateSplashTrigger,
  noteGameFinished,
  hasGuestSeenSplash,
  markGuestSplashShown,
  type SplashTrigger,
} from "@/lib/splashTriggers";
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

const REACTION_DISPLAY_MS = 1600;
// How long the floating die's own arc leg of a corner-to-corner handoff
// takes (see the overlay-positioning logic in the board-geometry effect
// below) — brisker than Dice.tsx's own flick-throw range (700-1050ms),
// since this hop is usually shorter and happens after every single roll, so
// it shouldn't feel like it's dragging the pace of play down.
const HANDOFF_ARC_MS = 550;

// Where a per-player sticker (see homeReactions below) lands: the center
// of that arm's "cage" — the same board-space rect Board.tsx draws the
// yard on — expressed as a 0..100 percentage of the board's own square
// footprint, so it can position a plain HTML overlay over boardSlotRef
// (sized to match the board exactly) without needing any of Konva's own
// pixel math. buildBoardLayout() is a cached pure function (see
// src/game/board.js), so this is cheap to call per seat, not memoized.
function homePositionPercent(armIndex: number) {
  const layout = buildBoardLayout();
  const cage = layout.arms[armIndex].cage;
  return {
    left: ((cage.x + cage.width / 2) / layout.viewBox) * 100,
    top: ((cage.y + cage.height / 2) / layout.viewBox) * 100,
  };
}

export default function GameView({ room }: { room: Room }) {
  const router = useRouter();
  const { data: session } = useSession();
  const { game, currentSeat, isMyTurn, validMoves } = useGame();
  const setGame = useGameStore((s) => s.setGame);
  const mySeats = useRoomStore((s) => s.mySeats);
  const resetRoomStore = useRoomStore((s) => s.reset);
  const isHost = !!room.hostSeatId && mySeats.some((s) => s.id === room.hostSeatId);
  // A matchmaking host can only end the whole game while every other seat
  // is a bot — with a real opponent seated, they can only leave (their own
  // seat exits, the match continues) — see room:endGame's matching guard
  // in server.js. Rooms created directly (not matched) keep the
  // unconditional End for their host, same as before this existed.
  const canEndGame =
    !room.matchmaking || !room.seats.some((s) => s.id !== room.hostSeatId && !s.bot);
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [rematchLoading, setRematchLoading] = useState(false);
  const [rematchError, setRematchError] = useState<string | null>(null);
  // Sampled so a normal finish doesn't ask every single time — computed
  // once per mount, not per render, so it stays stable while this game is
  // in progress. Ended-early games always ask (rarer, higher-signal) — see
  // the finished branch below.
  const [showFeedbackSample] = useState(() => Math.random() < 1 / 3);
  // Flash-discount splash (see src/components/game/DiscountSplash.tsx) —
  // gameStartRef anchors "minutes played" for this game (component mounts
  // fresh per room, including on rematch — see room.code in the layout
  // effect's dependency comment below), and splashEvaluatedRef ensures the
  // trigger check below only ever runs once per finished game, not on
  // every re-render while the results screen is up.
  const gameStartRef = useRef<number>(0);
  const splashEvaluatedRef = useRef(false);
  // A trigger firing (pendingSplashTrigger) only means "ask when they try to
  // leave" — it does NOT consume the one-time server/local "shown" flag by
  // itself. That only happens in handleBackHome below, right before the
  // splash actually opens — so a host who taps "Play again" instead never
  // burns their one shot on a splash nobody saw.
  const [pendingSplashTrigger, setPendingSplashTrigger] = useState<SplashTrigger | null>(null);
  const [splashOpen, setSplashOpen] = useState(false);
  const [checkingSplash, setCheckingSplash] = useState(false);
  useEffect(() => {
    gameStartRef.current = Date.now();
  }, []);
  const [activeReaction, setActiveReaction] = useState<Reaction | null>(null);
  const reactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Per-seat stickers sent via a player card's own sticker button (see
  // PlayerCorner.tsx) — shown at that seat's home on the board instead of
  // center-screen, keyed by seatId so more than one can be up at once.
  const [homeReactions, setHomeReactions] = useState<Record<string, Reaction>>({});
  const homeReactionTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
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
  // The floating <Dice/> overlay's own positioned ancestor (see diceMount
  // below) — a fixed-position box whose left/top this same board-geometry
  // effect drives directly (imperative style writes, not React state — see
  // recompute below) so it always sits exactly over whichever corner's
  // reserved dice slot currently holds the turn, and so a corner-to-corner
  // handoff can measure the old/new slot positions and animate between them
  // in that same synchronous pass, with no extra render round-trip.
  const diceOverlayRef = useRef<HTMLDivElement>(null);
  // The overlay's own x/y/scale offset, relative to wherever it's currently
  // anchored — animated from the old corner's position down to {x:0,y:0}
  // (see playHandoffArc below) whenever diceArm actually changes to a
  // different corner, instead of a hard cut.
  const diceHandoffControls = useAnimationControls();
  // Every corner's own reserved dice-slot element (see PlayerCorner.tsx's
  // diceSlotRef), keyed by arm — tracked regardless of which corner
  // currently holds the die, so a handoff's *source* corner (which no
  // longer has it) can still be measured too. A plain ref object (not
  // state): these never need to trigger a render themselves, only to be
  // read inside the geometry effect below.
  const cornerSlotElsRef = useRef<Partial<Record<number, HTMLDivElement>>>({});
  // Stable ref-callback identities (created once) so passing them down to
  // PlayerCorner doesn't detach/reattach the slot ref on every render.
  const cornerSlotRefCallbacks = useRef(
    [0, 1, 2, 3].map((arm) => (el: HTMLDivElement | null) => {
      if (el) cornerSlotElsRef.current[arm] = el;
      else delete cornerSlotElsRef.current[arm];
    }),
  ).current;
  // Which arm the overlay was last positioned at — lets the geometry effect
  // tell "diceArm actually just changed to a new corner" (play the handoff
  // arc) apart from "recomputing for some other reason, e.g. a resize"
  // (just reposition instantly, no replayed animation).
  const lastPositionedArmRef = useRef<number | null>(null);
  const [boardSize, setBoardSize] = useState<number | null>(null);
  const [diceGeometry, setDiceGeometry] = useState<{
    restPoint: { x: number; y: number };
    safeRegion: { left: number; top: number; size: number };
  } | null>(null);
  const [lastThrowStyle, setLastThrowStyle] = useState<ThrowStyle>("tap");
  const hasGame = Boolean(game);
  // Shared with whichever PlayerCorner currently has the turn, so its card
  // border traces the exact same pausable auto-roll countdown Dice.tsx
  // drives — see PlayerCorner.tsx's rollProgress prop.
  const rollProgressMV = useMotionValue(0);
  // Which corner the dice currently sits next to (see the render below) —
  // its on-screen position moves with this, so the flick-throw geometry
  // below needs to recompute on every change, not just on resize.
  const currentArm = currentSeat?.armIndex ?? null;

  // A roll can end the turn in the very same state update it happened in
  // (no legal move, three sixes, or a lone move auto-played — see
  // rollDice/moveToken in src/game/engine.js): the roller and the new
  // current seat arrive together in one game:update, with no separate
  // render in between. Without this, `diceArm` below would jump straight
  // to the new seat and the single shared <Dice/> instance would unmount
  // from the roller's corner and remount in the next player's before its
  // spin ever gets to play — "click dice, nothing rolls, turn just passes"
  // (see Dice.tsx's rollSeq-keyed animation effect, which only fires while
  // the instance stays mounted across the update). So: whenever rollSeq
  // changes, keep the die anchored at whoever just rolled for long enough
  // to show the roll, then let it hop to the real current seat.
  //
  // `lastSeenRoll` remembers, as of the last render that saw a given
  // rollSeq, which arm was about to roll next — i.e. exactly the roller for
  // whatever roll shows up with the next rollSeq. State (not a ref) so this
  // comparison-with-the-previous-render can safely happen during render
  // itself, matching React's documented pattern for deriving state from a
  // prop change without an extra round-trip through an effect (which would
  // let one render slip through with the die already in the new corner).
  const [lastSeenRoll, setLastSeenRoll] = useState<{ rollSeq: number; nextRollerArm: number } | null>(null);
  const [diceHoldArm, setDiceHoldArm] = useState<number | null>(null);
  if (game && (!lastSeenRoll || lastSeenRoll.rollSeq !== game.rollSeq)) {
    if (lastSeenRoll) setDiceHoldArm(lastSeenRoll.nextRollerArm);
    setLastSeenRoll({ rollSeq: game.rollSeq, nextRollerArm: currentSeat?.armIndex ?? 0 });
  }
  useEffect(() => {
    if (diceHoldArm == null) return;
    // DICE_HOLD_MS (src/game/engine.js) — long enough past Dice.tsx's own
    // spin/throw durations (650-1050ms) for the roll to have visibly landed
    // before the die hops corners. server.js derives its bot re-roll delay
    // from this same constant so a bot can never roll again before this
    // hold has released — see the comment there.
    const timer = setTimeout(() => setDiceHoldArm(null), DICE_HOLD_MS);
    return () => clearTimeout(timer);
  }, [diceHoldArm, game?.rollSeq]);
  const diceArm = diceHoldArm ?? currentArm;

  // Plays the floating dice overlay's own corner-to-corner arc leg (see
  // diceOverlayRef/diceHandoffControls above and the geometry effect below,
  // which computes `startOffset` and kicks this off): the same curved-arc
  // shape Dice.tsx's own flick-throw uses (arcKeyframes), settling with the
  // same squash-bounce (playSettleBounces) — just traveling between two
  // corners instead of between a resting spot and a point on the board.
  async function playHandoffArc(startOffset: Point) {
    const { x, y } = arcKeyframes(startOffset, { x: 0, y: 0 });
    await diceHandoffControls.start({
      x,
      y,
      transition: {
        duration: HANDOFF_ARC_MS / 1000,
        times: [0, 0.55, 1],
        ease: ["easeOut", "easeIn"],
      },
    });
    const bounces = Math.round(randomBetween(1, 2));
    await playSettleBounces(diceHandoffControls, bounces);
  }

  useLayoutEffect(() => {
    const areaEl = boardAreaRef.current;
    const topRowEl = topRowRef.current;
    const bottomRowEl = bottomRowRef.current;
    const overlayEl = diceOverlayRef.current;
    if (!areaEl || !topRowEl || !bottomRowEl || !overlayEl || diceArm == null) return;
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
      // An 80%-of-the-board square, centered, so a throw never lands flush
      // against the edge.
      const safeSize = size * 0.8;

      // Reposition the floating dice overlay directly over whichever
      // corner's own reserved dice slot currently holds the turn (see
      // cornerSlotElsRef/PlayerCorner.tsx's diceSlotRef) — an imperative
      // style write (not React state) so this and the restPoint below
      // always see the same already-updated position in this one
      // synchronous pass, with no extra render round-trip. Whenever this is
      // a genuine handoff — the die was just sitting at a *different*
      // corner a moment ago, not merely a resize/rematch recompute of the
      // same corner — it also plays the arc travel animation between the
      // two, unless reduced motion is requested, in which case it just
      // relocates instantly (today's behavior).
      const slotEl = cornerSlotElsRef.current[diceArm];
      if (!slotEl) return;
      const slotRect = slotEl.getBoundingClientRect();
      overlayEl.style.left = `${slotRect.left}px`;
      overlayEl.style.top = `${slotRect.top}px`;
      overlayEl.style.width = `${slotRect.width}px`;
      overlayEl.style.height = `${slotRect.height}px`;

      if (lastPositionedArmRef.current !== diceArm) {
        const prevArm = lastPositionedArmRef.current;
        lastPositionedArmRef.current = diceArm;
        const prevSlotEl = prevArm != null ? cornerSlotElsRef.current[prevArm] : null;
        if (prevSlotEl && !reduceMotion) {
          const prevRect = prevSlotEl.getBoundingClientRect();
          const startOffset: Point = {
            x: prevRect.left - slotRect.left,
            y: prevRect.top - slotRect.top,
          };
          diceHandoffControls.set({ x: startOffset.x, y: startOffset.y, scaleX: 1, scaleY: 1 });
          playHandoffArc(startOffset);
        } else {
          diceHandoffControls.set({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
        }
      }

      setDiceGeometry({
        restPoint: { x: slotRect.left + slotRect.width / 2, y: slotRect.top + slotRect.height / 2 },
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
    // leaving boardSize/diceGeometry permanently null. Also re-attempts on
    // every `diceArm` change: the dice moves to a different row/side each
    // time it relocates (see the render below and diceArm above), which
    // shifts diceWrapRef's own position without necessarily changing any
    // observed element's size, so the ResizeObserver alone wouldn't catch
    // it.
    //
    // Also keyed on `room.code` and `game.status`: a "Play again" rematch
    // swaps this whole subtree out (the `game.status === "finished"` branch
    // above renders none of these refs at all) and back in, but GameView
    // itself isn't guaranteed to remount across that — Next's router
    // doesn't force a remount just because the room's dynamic route segment
    // changed. If `hasGame` and `diceArm` both happen to hold their
    // pre-rematch values (common: a fresh game always starts at seat index
    // 0, which often carries the same arm as whatever was showing when the
    // last game ended), this effect would never re-run at all, leaving its
    // ResizeObserver attached to the old game's now-unmounted nodes and the
    // new board permanently unmeasured (invisible) until something else
    // happens to change diceArm, e.g. the first roll of the new game.
    // `room.code` always changes on rematch (a new room is created), so
    // it's a reliable trigger even when the others coincidentally aren't.
    //
    // Also reads diceHandoffControls/playHandoffArc/reduceMotion (for the
    // handoff-arc logic above) without listing them: diceHandoffControls is
    // framer-motion's own stable controls object (identity never changes
    // across renders, same as a ref), playHandoffArc is a plain function
    // whose own body always closes over each render's latest values anyway,
    // and reduceMotion only ever needs to reflect whatever it is at the
    // moment a given handoff actually starts, not to itself re-trigger this
    // effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasGame, diceArm, room.code, game?.status]);

  const showReaction = (reaction: Reaction) => {
    setActiveReaction(reaction);
    if (reactionTimerRef.current) clearTimeout(reactionTimerRef.current);
    reactionTimerRef.current = setTimeout(() => setActiveReaction(null), REACTION_DISPLAY_MS);
  };
  const handleReact = (reaction: Reaction) => {
    showReaction(reaction);
    sendReaction(room.code, reaction);
  };

  const showHomeReaction = (seatId: string, reaction: Reaction) => {
    setHomeReactions((prev) => ({ ...prev, [seatId]: reaction }));
    if (homeReactionTimersRef.current[seatId]) clearTimeout(homeReactionTimersRef.current[seatId]);
    homeReactionTimersRef.current[seatId] = setTimeout(() => {
      setHomeReactions((prev) => {
        const next = { ...prev };
        delete next[seatId];
        return next;
      });
    }, REACTION_DISPLAY_MS);
  };
  const handleSendPlayerSticker = (seatId: string, reaction: Reaction) => {
    showHomeReaction(seatId, reaction);
    sendReaction(room.code, reaction, seatId);
  };

  useEffect(
    () => () => {
      if (reactionTimerRef.current) clearTimeout(reactionTimerRef.current);
      Object.values(homeReactionTimersRef.current).forEach(clearTimeout);
    },
    [],
  );

  // Reactions broadcast from other seats/spectators in the same room — the
  // sender already shows theirs locally via handleReact/handleSendPlayerSticker
  // above, so this only ever fires for reactions someone else sent (see
  // game:reaction in server.js, which relays to everyone but the sender).
  // A targetSeatId (a per-player sticker — see PlayerCorner.tsx) routes it
  // to that seat's home instead of the usual center-screen pop.
  useEffect(() => {
    const socket = getSocket();
    const onIncoming = (payload: Reaction & { targetSeatId?: string }) => {
      const { targetSeatId, ...reaction } = payload;
      if (targetSeatId) {
        showHomeReaction(targetSeatId, reaction as Reaction);
        return;
      }
      setActiveReaction(reaction as Reaction);
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
      await rematch(room.code, room.hostSeatId!);
    } catch (e) {
      setRematchError(e instanceof Error ? e.message : "Could not start a rematch");
      setRematchLoading(false);
    }
  };

  // Bar shortcuts for the two things everyone eventually wants mid-game —
  // one click + a confirm, instead of burying them in the "more" menu.
  const handleBarEndGame = () => {
    emitEndGame(room.code, room.hostSeatId!).catch(() => {});
  };

  const handleLeaveGame = () => {
    leaveRoom(room.code);
    clearOwnedSeats(room.code);
    resetRoomStore();
    router.push(session?.user ? "/" : "/play");
  };

  // From GameMenu's host-only Players list — opens PlayerActionsModal for
  // the tapped seat, same as tapping a player's card used to before that
  // was disabled (it sat right next to the dice slot and was catching
  // mistaps meant for the die — see PlayerCorner.tsx).
  const handleManagePlayer = (seatId: string) => {
    setGameMenuOpen(false);
    setSelectedSeatId(seatId);
  };

  // Evaluates once per finished game whether any flash-splash trigger
  // signal (session count, pages browsed, minutes played, games completed,
  // leaving /pricing — see src/lib/splashTriggers.ts) has fired. Purely
  // local/synchronous — the actual eligibility check (and the one-time
  // "shown" flag it sets) is deferred to handleBackHome below, so this
  // never spends that budget on a game whose results screen the player
  // never tries to leave.
  useEffect(() => {
    if (game?.status !== "finished" || splashEvaluatedRef.current) return;
    splashEvaluatedRef.current = true;
    const minutesPlayed = (Date.now() - gameStartRef.current) / 60000;
    noteGameFinished(minutesPlayed);
    const trigger = evaluateSplashTrigger();
    if (trigger) {
      // Deferred a tick — an effect shouldn't setState synchronously in its
      // own body (see react-hooks/set-state-in-effect).
      Promise.resolve().then(() => setPendingSplashTrigger(trigger));
    }
  }, [game?.status]);

  const goHome = () => router.push(session?.user ? "/" : "/play");

  // Intercepts "Back home" (not "Play again" — a rematch just continues,
  // see handleRematch): only *here*, at the moment they actually try to
  // leave, do we spend the one-time splash budget. Signed-in eligibility is
  // a real server round trip (also the atomic "mark shown" — see
  // /api/splash/eligibility); guests are checked/marked locally.
  const handleBackHome = async () => {
    if (!pendingSplashTrigger) {
      goHome();
      return;
    }
    if (session?.user) {
      setCheckingSplash(true);
      try {
        const res = await fetch("/api/splash/eligibility", { method: "POST" });
        const data: { eligible: boolean } = res.ok ? await res.json() : { eligible: false };
        if (data.eligible) setSplashOpen(true);
        else goHome();
      } catch {
        goHome();
      } finally {
        setCheckingSplash(false);
      }
      return;
    }
    if (hasGuestSeenSplash()) {
      goHome();
      return;
    }
    markGuestSplashShown();
    setSplashOpen(true);
  };

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

    // Leads the share message with the viewer's own result rather than a
    // generic pitch — they're sharing *this* game, not just the app.
    const myPlacement = winners.find((w) => mySeats.some((s) => s.id === w.seatId));
    const playerCount = game.seats.length;
    const resultLine = game.endedEarly
      ? "Just played a game of Ludo on MyLudo!"
      : myPlacement?.rank === 1
        ? `I just won a ${playerCount}-player Ludo game on MyLudo! 🏆`
        : myPlacement
          ? `I just came ${myPlacement.rank === 2 ? "2nd" : "3rd"} in a ${playerCount}-player Ludo game on MyLudo!`
          : `Just played a ${playerCount}-player Ludo game on MyLudo!`;
    const buildShareMessage = (url: string, pct: number | null) =>
      pct ? `${resultLine} Play with me — sign up and we both get ${pct}% off! ${url}` : `${resultLine} Play with me! ${url}`;

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex min-h-dvh flex-col items-center justify-center gap-3 overflow-y-auto px-8 py-4 text-center"
      >
        <div className="flex w-full max-w-xs gap-2">
          <ShareInviteButton source="post_game" variant="button" buildMessage={buildShareMessage} />
          <Button variant="secondary" className="flex-1" onClick={handleBackHome} disabled={checkingSplash}>
            Back home
          </Button>
        </div>
        {(showFeedbackSample || game.endedEarly) && (
          <FeedbackPrompt context="GAME_FINISHED" gameId={room.code} />
        )}
        {splashOpen && pendingSplashTrigger && (
          <DiscountSplash
            trigger={pendingSplashTrigger}
            isSignedIn={!!session?.user}
            onClose={() => {
              setSplashOpen(false);
              goHome();
            }}
          />
        )}
        <div className="flex w-full max-w-xs flex-col gap-1.5">
          {winners.map((r) => (
            <div key={r.seatId} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-2.5">
              <span className="w-5 shrink-0 text-lg font-extrabold text-ink-muted">{r.rank}</span>
              {r.color && <span className="h-7 w-7 shrink-0 rounded-full" style={{ backgroundColor: r.color.hex }} />}
              <span className="flex-1 truncate text-left font-semibold">{r.name}</span>
            </div>
          ))}
          {losers.map((r) => (
            <div
              key={r.seatId}
              className="flex items-center gap-3 rounded-2xl border border-dashed border-line p-2.5 opacity-70"
            >
              <span className="w-5 shrink-0 text-xs font-semibold text-ink-muted">
                {game.endedEarly ? "—" : "Last"}
              </span>
              {r.color && <span className="h-7 w-7 shrink-0 rounded-full" style={{ backgroundColor: r.color.hex }} />}
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
  // The current seat's own decaying deadline (see INACTIVITY_TIMEOUTS_MS in
  // src/game/engine.js) — purely for the visual countdowns below (Dice's
  // ring, PlayerCorner's border trace). The actual auto-roll/auto-move only
  // ever happens server-side, once server.js's sweepTurnTimeouts decides
  // this seat's real deadline has passed, so these just mirror that.
  const [autoRollMs, autoMoveMs] = timeoutsForLevel(currentSeat?.inactivityLevel);

  const handleRoll = (style: ThrowStyle) => {
    if (!currentSeat || !canRoll) return;
    setLastThrowStyle(style);
    emitRollDice(room.code, currentSeat.id, style);
  };

  // A single Dice instance, mounted once for the whole game (never
  // unmounted/remounted as the turn passes — see diceOverlayRef/
  // diceHandoffControls above), floated over whichever corner currently
  // holds the die via a fixed-position wrapper the board-geometry effect
  // positions directly (imperative style writes) and animates between
  // corners along the same curved arc Dice.tsx's own flick-throw uses (see
  // playHandoffArc above), instead of hard-cutting between them. Each
  // PlayerCorner below just reserves blank space for it (see `dice`/
  // diceSlotRef there) rather than mounting it as a child — so it's never
  // actually inside any one corner's own DOM subtree, and so it can keep
  // animating smoothly across a corner change without ever disappearing.
  // Deliberately keyed off diceArm rather than currentArm — see the note
  // above diceArm.
  const diceMount = diceArm != null && (
    <div ref={diceOverlayRef} className="pointer-events-none fixed z-[15]">
      <motion.div
        animate={diceHandoffControls}
        initial={{ x: 0, y: 0, scaleX: 1, scaleY: 1 }}
        className="pointer-events-auto h-full w-full"
      >
        <div ref={diceWrapRef} className="h-full w-full">
          <Dice
            lastRoll={game.lastRoll}
            rollSeq={game.rollSeq}
            canRoll={canRoll}
            onRoll={handleRoll}
            restPoint={diceGeometry?.restPoint ?? null}
            safeRegion={diceGeometry?.safeRegion ?? null}
            diceValue={game.diceValue}
            throwStyle={lastThrowStyle}
            rollProgress={rollProgressMV}
            glowColor={currentSeat ? colorForArm(currentSeat.armIndex).hex : "#2B2016"}
            autoRollMs={autoRollMs}
          />
        </div>
      </motion.div>
    </div>
  );

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
      {diceMount}
      {selectedSeatId && (
        <PlayerActionsModal
          room={room}
          game={game}
          seatId={selectedSeatId}
          canEndGame={canEndGame}
          onLeaveGame={handleLeaveGame}
          onClose={() => setSelectedSeatId(null)}
        />
      )}
      {gameMenuOpen && (
        <GameMenu
          roomCode={room.code}
          isHost={isHost}
          hostSeatId={room.hostSeatId}
          seats={room.seats}
          canEndGame={canEndGame}
          onLeaveGame={handleLeaveGame}
          onManagePlayer={handleManagePlayer}
          onClose={() => setGameMenuOpen(false)}
        />
      )}

      {/* The game bar and dice bar stay pinned to the viewport's top/bottom
          edges (root scrolls instead of clipping, so sticky has a scroll
          context to stick within on short viewports); the player rows sit
          as ordinary flex siblings immediately against the board instead. */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-center border-b border-line bg-bg px-2 py-2 sm:px-4">
        <ReactionBar
          onReact={handleReact}
          onMore={() => setGameMenuOpen(true)}
          isHost={isHost}
          canEndGame={canEndGame}
          onEndGame={handleBarEndGame}
          onLeaveGame={handleLeaveGame}
        />
      </div>

      {isHost && (
        <div className="shrink-0 px-2 pt-2 sm:px-4">
          <IncomingJoinRequests roomCode={room.code} />
        </div>
      )}

      <div ref={boardAreaRef} className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <div ref={topRowRef} className="flex w-full shrink-0 items-center justify-between px-2 pb-2 sm:px-4">
          <PlayerCorner
            seat={seatByArm.get(0) ?? null}
            isTurn={seatByArm.get(0)?.id === currentSeat?.id}
            placement={placementForArm(seatByArm.get(0))}
            suspended={suspendedForArm(seatByArm.get(0))}
            rollProgress={currentArm === 0 && canRoll ? rollProgressMV : undefined}
            canMove={currentArm === 0 && canMove}
            moveTimeoutMs={autoMoveMs}
            dice={diceArm === 0}
            diceSlotRef={cornerSlotRefCallbacks[0]}
            onSendSticker={handleSendPlayerSticker}
          />
          <PlayerCorner
            seat={seatByArm.get(1) ?? null}
            isTurn={seatByArm.get(1)?.id === currentSeat?.id}
            placement={placementForArm(seatByArm.get(1))}
            suspended={suspendedForArm(seatByArm.get(1))}
            rollProgress={currentArm === 1 && canRoll ? rollProgressMV : undefined}
            canMove={currentArm === 1 && canMove}
            moveTimeoutMs={autoMoveMs}
            dice={diceArm === 1}
            diceSlotRef={cornerSlotRefCallbacks[1]}
            diceFirst
            onSendSticker={handleSendPlayerSticker}
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
                key="center-reaction"
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
            {Object.entries(homeReactions).map(([seatId, reaction]) => {
              const seat = room.seats.find((s) => s.id === seatId);
              if (!seat) return null;
              const pos = homePositionPercent(seat.armIndex);
              return (
                <motion.div
                  key={`home-${seatId}`}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="pointer-events-none absolute flex items-center justify-center"
                  // `x`/`y` (framer-motion's own translate shorthand, not a
                  // raw `transform` string) so this composes with the
                  // `scale` in animate/exit into one transform instead of
                  // one silently overwriting the other — a plain
                  // `transform: "translate(-50%,-50%)"` here was getting
                  // clobbered by the scale animation, leaving this
                  // uncentered.
                  style={{ left: `${pos.left}%`, top: `${pos.top}%`, x: "-50%", y: "-50%" }}
                >
                  {reaction.kind === "emoji" ? (
                    <span className="text-[32cqmin] leading-none drop-shadow-lg">{reaction.value}</span>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={reaction.src}
                      alt={reaction.alt}
                      className="h-[32cqmin] w-[32cqmin] object-contain drop-shadow-lg"
                    />
                  )}
                </motion.div>
              );
            })}
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

        <div ref={bottomRowRef} className="flex w-full shrink-0 items-center justify-between px-2 pt-2 sm:px-4">
          <PlayerCorner
            seat={seatByArm.get(3) ?? null}
            isTurn={seatByArm.get(3)?.id === currentSeat?.id}
            placement={placementForArm(seatByArm.get(3))}
            suspended={suspendedForArm(seatByArm.get(3))}
            rollProgress={currentArm === 3 && canRoll ? rollProgressMV : undefined}
            canMove={currentArm === 3 && canMove}
            moveTimeoutMs={autoMoveMs}
            dice={diceArm === 3}
            diceSlotRef={cornerSlotRefCallbacks[3]}
            bottomRow
            onSendSticker={handleSendPlayerSticker}
          />
          <PlayerCorner
            seat={seatByArm.get(2) ?? null}
            isTurn={seatByArm.get(2)?.id === currentSeat?.id}
            placement={placementForArm(seatByArm.get(2))}
            suspended={suspendedForArm(seatByArm.get(2))}
            rollProgress={currentArm === 2 && canRoll ? rollProgressMV : undefined}
            canMove={currentArm === 2 && canMove}
            moveTimeoutMs={autoMoveMs}
            dice={diceArm === 2}
            diceSlotRef={cornerSlotRefCallbacks[2]}
            diceFirst
            bottomRow
            onSendSticker={handleSendPlayerSticker}
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
  canEndGame,
  onLeaveGame,
  onClose,
}: {
  room: Room;
  game: GameState;
  seatId: string;
  canEndGame: boolean;
  onLeaveGame: () => void;
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
      await emitEndGame(room.code, room.hostSeatId!);
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
                {canEndGame
                  ? "Play stops for everyone right away. If the game's gone on long enough, results are saved as a real win/loss for everyone based on the board right now — otherwise it's saved as unresolved for anyone who hasn't already finished."
                  : "You'll leave the game — it continues for the other players."}
              </p>
              {endGameError && <p className="text-sm text-accent">{endGameError}</p>}
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setConfirmingEnd(false)} disabled={endGameLoading}>
                  Cancel
                </Button>
                <Button onClick={canEndGame ? handleEndGame : onLeaveGame} disabled={endGameLoading}>
                  {canEndGame ? (endGameLoading ? "Ending…" : "End game") : "Leave"}
                </Button>
              </div>
            </>
          ) : (
            <button
              onClick={() => setConfirmingEnd(true)}
              className="self-start rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-accent"
            >
              {canEndGame ? "End game" : "Leave game"}
            </button>
          )
        ) : (
          <>
            {won && <p className="text-sm text-ink-muted">Already finished — nothing to manage.</p>}
            {removed && <p className="text-sm text-ink-muted">Removed from this game.</p>}
            {!won && !removed && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => (suspended ? resumeSeat : suspendSeat)(room.code, seatId, room.hostSeatId!).catch(() => {})}
                  className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-accent"
                >
                  {suspended ? "Resume" : "Pause"}
                </button>
                <button
                  onClick={() => {
                    removeSeat(room.code, seatId, room.hostSeatId!).catch(() => {});
                    onClose();
                  }}
                  className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-accent"
                >
                  Remove
                </button>
                {seat.connected && !suspended && (
                  <button
                    onClick={() => transferHost(room.code, seatId, room.hostSeatId!).catch(() => {})}
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
