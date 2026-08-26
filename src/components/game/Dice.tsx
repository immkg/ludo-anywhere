"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

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

type DiceProps = {
  value: number | null;
  canRoll: boolean;
  onRoll: () => void;
};

export default function Dice({ value, canRoll, onRoll }: DiceProps) {
  const pips = PIP_LAYOUTS[value ?? 1] ?? [];

  return (
    <button
      onClick={onRoll}
      disabled={!canRoll}
      className={cn(
        "relative h-16 w-16 rounded-2xl bg-surface border-2 shadow-lg transition disabled:opacity-40",
        canRoll ? "border-accent active:scale-95" : "border-line"
      )}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={value ?? "empty"}
          initial={{ rotate: -90, scale: 0.5, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={{ rotate: 90, scale: 0.5, opacity: 0 }}
          className="absolute inset-1 grid grid-cols-3 grid-rows-3 gap-0.5 p-1.5"
        >
          {value == null ? (
            <span className="col-span-3 row-span-3 flex items-center justify-center text-2xl">🎲</span>
          ) : (
            Array.from({ length: 9 }, (_, i) => {
              const row = Math.floor(i / 3);
              const col = i % 3;
              const active = pips.some(([r, c]) => r === row && c === col);
              return <span key={i} className={cn("m-auto h-2 w-2 rounded-full", active ? "bg-ink" : "bg-transparent")} />;
            })
          )}
        </motion.div>
      </AnimatePresence>
    </button>
  );
}
