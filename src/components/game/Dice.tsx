"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { playDiceRoll } from "@/lib/sound";

const MIN_SPIN_MS = 650;
const SPIN_LOOP_SECONDS = 0.5;
const LAND_SECONDS = 0.55;
const LAND_EASE = [0.16, 1, 0.3, 1] as const;
const CUBE_SIZE = 64; // px — matches h-16 w-16
const HALF = CUBE_SIZE / 2;
const AUTO_ROLL_MS = 5000;
const AUTO_MOVE_MS = 15000;

const PIP_LAYOUTS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [0, 2],
    [2, 0],
    [2, 2],
  ],
  5: [
    [0, 0],
    [0, 2],
    [1, 1],
    [2, 0],
    [2, 2],
  ],
  6: [
    [0, 0],
    [0, 2],
    [1, 0],
    [1, 2],
    [2, 0],
    [2, 2],
  ],
};

// Each face's own placement on the cube: rotate it to face outward, then
// push it out along its (now rotated) local Z axis by half the cube size.
const FACE_PLACEMENT: Record<number, string> = {
  1: `translateZ(${HALF}px)`,
  6: `rotateY(180deg) translateZ(${HALF}px)`,
  2: `rotateY(90deg) translateZ(${HALF}px)`,
  5: `rotateY(-90deg) translateZ(${HALF}px)`,
  3: `rotateX(90deg) translateZ(${HALF}px)`,
  4: `rotateX(-90deg) translateZ(${HALF}px)`,
};

// The cube rotation (deg) that brings each face flush to the viewer —
// the inverse of that face's own placement rotation above.
const LANDING_ORIENTATION: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: 0, y: -90 },
  3: { x: -90, y: 0 },
  4: { x: 90, y: 0 },
  5: { x: 0, y: 90 },
  6: { x: 0, y: 180 },
};

function Face({
  value,
  numberColor,
  frameColor,
}: {
  value: number;
  // The pips: colored for whoever actually rolled this number.
  numberColor: string;
  // The border: colored for whoever currently needs to roll/move, even
  // once that's someone else — see the cubeColor/color split below.
  frameColor: string;
}) {
  const pips = PIP_LAYOUTS[value] ?? [];
  return (
    <div
      className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-0.5 rounded-2xl border-2 bg-surface p-1.5 [backface-visibility:hidden]"
      style={{ transform: FACE_PLACEMENT[value], borderColor: frameColor }}
    >
      {Array.from({ length: 9 }, (_, i) => {
        const row = Math.floor(i / 3);
        const col = i % 3;
        const active = pips.some(([r, c]) => r === row && c === col);
        return (
          <span
            key={i}
            className="m-auto h-2 w-2 rounded-full bg-transparent"
            style={active ? { backgroundColor: numberColor } : undefined}
          />
        );
      })}
    </div>
  );
}

type DiceProps = {
  lastRoll: number | null;
  rollSeq: number;
  canRoll: boolean;
  onRoll: () => void;
  // True while it's this device's turn and a token move is pending — drives
  // the same countdown ring as canRoll, just on the longer auto-move clock,
  // so a stalled move is just as visible as a stalled roll.
  canMove: boolean;
  // The color of whichever seat currently needs to roll/move — stays put
  // (doesn't fade back to neutral) until that turn actually advances, so
  // the dice keeps reading as "this is so-and-so's turn" through bonus
  // rolls too, not just the instant right after a roll.
  color: string;
  // Mirrors isRolling out to the parent — the "Roll"/"Move" label now lives
  // up in the player-name row (see DiceLabel), separate from this cube, but
  // still needs to hide for the same window the spin animation is playing.
  onRollingChange?: (isRolling: boolean) => void;
};

export default function Dice({ lastRoll, rollSeq, canRoll, onRoll, canMove, color, onRollingChange }: DiceProps) {
  const [isRolling, setIsRolling] = useState(false);
  const [orientation, setOrientation] = useState(() => LANDING_ORIENTATION[lastRoll ?? 1]);
  const prevRollSeqRef = useRef(rollSeq);
  const spinStartRef = useRef(0);
  const landTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The pips stay in whichever color rolled the number currently on
  // display — they only change when a *new* roll actually lands, not
  // whenever `color` (whose turn it is now) moves on, e.g. once that
  // player's token move ends their turn with no bonus roll. The face's
  // border and everything else outside the cube (ring, countdown arc)
  // track `color` directly, since those are about whose turn it is now.
  const [cubeColor, setCubeColor] = useState(color);
  // Holds `color` as of just before the current render, so the roll-landing
  // effect below can read "who actually rolled" even when that same update
  // also advances the turn (a roll with no valid moves ends the turn in the
  // same broadcast) — by the time this render's `color` prop is read, it may
  // already be the next player's.
  const prevColorRef = useRef(color);

  function spinFrom(prev: { x: number; y: number }) {
    return { x: prev.x + 360 * 3, y: prev.y + 360 * 4 };
  }

  // Fires for every viewer (the roller and anyone spectating) whenever the
  // server confirms a new roll — this is the only thing allowed to stop the
  // spin, so it can never get stuck even when a turn auto-forfeits and
  // diceValue lands back on null.
  useEffect(() => {
    if (rollSeq === prevRollSeqRef.current) return;
    prevRollSeqRef.current = rollSeq;
    const rollerColor = prevColorRef.current;

    const alreadySpinning = isRolling && Date.now() - spinStartRef.current < MIN_SPIN_MS;
    if (!alreadySpinning) {
      spinStartRef.current = Date.now();
      setIsRolling(true);
      setOrientation(spinFrom);
      playDiceRoll();
    }

    const target = LANDING_ORIENTATION[lastRoll ?? 1];
    const remaining = Math.max(0, MIN_SPIN_MS - (Date.now() - spinStartRef.current));
    if (landTimeoutRef.current) clearTimeout(landTimeoutRef.current);
    landTimeoutRef.current = setTimeout(() => {
      setOrientation({ x: target.x + 360 * 2, y: target.y + 360 * 2 });
      setIsRolling(false);
      setCubeColor(rollerColor);
    }, remaining);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollSeq, lastRoll]);

  // Runs after the roll-landing effect above on any render where both
  // change together, so that effect still sees the pre-update color.
  useEffect(() => {
    prevColorRef.current = color;
  }, [color]);

  useEffect(() => {
    return () => {
      if (landTimeoutRef.current) clearTimeout(landTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    onRollingChange?.(isRolling);
  }, [isRolling, onRollingChange]);

  // Ref so the auto-roll timer doesn't restart on every re-render — the
  // parent passes a fresh onRoll closure each time it renders.
  const onRollRef = useRef(onRoll);
  useEffect(() => {
    onRollRef.current = onRoll;
  }, [onRoll]);

  useEffect(() => {
    if (!canRoll || isRolling) return;
    const timer = setTimeout(() => onRollRef.current(), AUTO_ROLL_MS);
    return () => clearTimeout(timer);
  }, [canRoll, isRolling]);

  function handleClick() {
    if (!canRoll || isRolling) return;
    spinStartRef.current = Date.now();
    setIsRolling(true);
    setOrientation(spinFrom);
    playDiceRoll();
    onRoll();
  }

  return (
    <button
      onClick={handleClick}
      disabled={!canRoll || isRolling}
      className={cn(
        "relative h-16 w-16 rounded-2xl transition disabled:opacity-40",
        canRoll && !isRolling ? "ring-2 ring-offset-2 ring-offset-bg active:scale-95" : ""
      )}
      style={{ perspective: 300, ...(canRoll && !isRolling ? ({ "--tw-ring-color": color } as CSSProperties) : {}) }}
    >
      {(canRoll || canMove) && !isRolling && (
        <svg
          // Keyed by phase so switching straight from "waiting to move" to
          // "waiting to roll" (a bonus turn after a six/capture, with no
          // isRolling window in between to naturally unmount this) forces a
          // fresh mount instead of the bar jumping mid-animation onto the
          // other phase's duration.
          key={canRoll ? "roll" : "move"}
          className="pointer-events-none absolute -inset-1.5 h-[calc(100%+12px)] w-[calc(100%+12px)] -rotate-90"
          viewBox="0 0 100 100"
        >
          <motion.rect
            x="2"
            y="2"
            width="96"
            height="96"
            rx="22"
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: (canRoll ? AUTO_ROLL_MS : AUTO_MOVE_MS) / 1000, ease: "linear" }}
          />
        </svg>
      )}

      <div className="relative h-full w-full" style={{ transformStyle: "preserve-3d" }}>
        <motion.div
          className="relative h-full w-full"
          style={{ transformStyle: "preserve-3d" }}
          animate={{
            rotateX: orientation.x,
            rotateY: orientation.y,
            scale: isRolling ? [1, 1.25, 1.05] : 1,
          }}
          transition={{
            rotateX: isRolling
              ? { duration: SPIN_LOOP_SECONDS, repeat: Infinity, ease: "linear" }
              : { duration: LAND_SECONDS, ease: LAND_EASE },
            rotateY: isRolling
              ? { duration: SPIN_LOOP_SECONDS, repeat: Infinity, ease: "linear" }
              : { duration: LAND_SECONDS, ease: LAND_EASE },
            scale: isRolling ? { duration: 0.35, ease: "easeOut" } : { duration: LAND_SECONDS, ease: LAND_EASE },
          }}
        >
          {[1, 2, 3, 4, 5, 6].map((value) => (
            <Face key={value} value={value} numberColor={cubeColor} frameColor={color} />
          ))}
        </motion.div>
      </div>
    </button>
  );
}
