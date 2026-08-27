"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const MIN_SPIN_MS = 650;
const SPIN_LOOP_SECONDS = 0.5;
const LAND_SECONDS = 0.55;
const LAND_EASE = [0.16, 1, 0.3, 1] as const;
const CUBE_SIZE = 64; // px — matches h-16 w-16
const HALF = CUBE_SIZE / 2;

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

function Face({ value }: { value: number }) {
  const pips = PIP_LAYOUTS[value] ?? [];
  return (
    <div
      className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-0.5 rounded-2xl border-2 border-line bg-surface p-1.5 [backface-visibility:hidden]"
      style={{ transform: FACE_PLACEMENT[value] }}
    >
      {Array.from({ length: 9 }, (_, i) => {
        const row = Math.floor(i / 3);
        const col = i % 3;
        const active = pips.some(([r, c]) => r === row && c === col);
        return <span key={i} className={cn("m-auto h-2 w-2 rounded-full", active ? "bg-ink" : "bg-transparent")} />;
      })}
    </div>
  );
}

type DiceProps = {
  lastRoll: number | null;
  rollSeq: number;
  canRoll: boolean;
  onRoll: () => void;
};

export default function Dice({ lastRoll, rollSeq, canRoll, onRoll }: DiceProps) {
  const [isRolling, setIsRolling] = useState(false);
  const [orientation, setOrientation] = useState(() => LANDING_ORIENTATION[lastRoll ?? 1]);
  const prevRollSeqRef = useRef(rollSeq);
  const spinStartRef = useRef(0);
  const landTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    const alreadySpinning = isRolling && Date.now() - spinStartRef.current < MIN_SPIN_MS;
    if (!alreadySpinning) {
      spinStartRef.current = Date.now();
      setIsRolling(true);
      setOrientation(spinFrom);
    }

    const target = LANDING_ORIENTATION[lastRoll ?? 1];
    const remaining = Math.max(0, MIN_SPIN_MS - (Date.now() - spinStartRef.current));
    if (landTimeoutRef.current) clearTimeout(landTimeoutRef.current);
    landTimeoutRef.current = setTimeout(() => {
      setOrientation({ x: target.x + 360 * 2, y: target.y + 360 * 2 });
      setIsRolling(false);
    }, remaining);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollSeq, lastRoll]);

  useEffect(() => {
    return () => {
      if (landTimeoutRef.current) clearTimeout(landTimeoutRef.current);
    };
  }, []);

  function handleClick() {
    if (!canRoll || isRolling) return;
    spinStartRef.current = Date.now();
    setIsRolling(true);
    setOrientation(spinFrom);
    onRoll();
  }

  return (
    <button
      onClick={handleClick}
      disabled={!canRoll || isRolling}
      className={cn(
        "relative h-16 w-16 rounded-2xl transition disabled:opacity-40",
        canRoll && !isRolling ? "ring-2 ring-accent ring-offset-2 ring-offset-bg active:scale-95" : ""
      )}
      style={{ perspective: 300 }}
    >
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
          <Face key={value} value={value} />
        ))}
      </motion.div>
    </button>
  );
}
