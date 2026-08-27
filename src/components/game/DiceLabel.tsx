"use client";

import { motion, AnimatePresence } from "framer-motion";

type DiceLabelProps = {
  canRoll: boolean;
  canMove: boolean;
  // Mirrors Dice's own isRolling state (via its onRollingChange prop) so
  // this can live apart from the cube — up in the player-name row — while
  // still hiding for the same window the cube's spin animation is playing.
  isRolling: boolean;
  color: string;
};

export default function DiceLabel({ canRoll, canMove, isRolling, color }: DiceLabelProps) {
  return (
    <AnimatePresence mode="wait">
      {(canRoll || canMove) && !isRolling && (
        <motion.div
          key={canRoll ? "roll" : "move"}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
          className="text-xs font-bold uppercase tracking-wide"
          style={{ color }}
        >
          {canRoll ? "Roll" : "Move"}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
