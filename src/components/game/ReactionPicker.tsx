"use client";

import { motion, useReducedMotion } from "framer-motion";

const EMOJIS = ["👍", "🎉", "😂", "😮", "😢", "🔥"];

const STICKERS: { src: string; alt: string }[] = [
  { src: "/brand/stickers/nice-roll.png", alt: "Nice roll!" },
  { src: "/brand/stickers/gg.png", alt: "GG" },
  { src: "/brand/stickers/woohoo.png", alt: "Woohoo!" },
  { src: "/brand/stickers/cheer.png", alt: "Cheering pawn" },
  { src: "/brand/stickers/so-close.png", alt: "So close!" },
  { src: "/brand/stickers/oops.png", alt: "Oops!" },
  { src: "/brand/stickers/unlucky.png", alt: "Unlucky" },
  { src: "/brand/stickers/laugh.png", alt: "Laughing pawn" },
];

export type Reaction = { kind: "emoji"; value: string } | { kind: "sticker"; src: string; alt: string };

// A local, self-only reaction picker — selecting an item shows a brief
// floating bubble near the Game Bar (see FloatingReaction in GameView).
// There's no realtime reaction broadcast in this pass — that needs a new
// Socket.IO event and room-state field, which is out of scope here (see
// the redesign report's assumptions).
export default function ReactionPicker({
  mode,
  onSelect,
  onClose,
}: {
  mode: "emoji" | "sticker";
  onSelect: (reaction: Reaction) => void;
  onClose: () => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.96 }}
      transition={{ duration: 0.15 }}
      className="absolute left-1/2 top-full z-20 mt-2 grid w-max -translate-x-1/2 grid-cols-4 gap-1.5 rounded-2xl border border-line bg-surface p-2 shadow-lg"
      role="menu"
    >
      {mode === "emoji"
        ? EMOJIS.map((e) => (
            <button
              key={e}
              role="menuitem"
              aria-label={`React with ${e}`}
              onClick={() => {
                onSelect({ kind: "emoji", value: e });
                onClose();
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full text-xl transition hover:bg-surface-2"
            >
              {e}
            </button>
          ))
        : STICKERS.map((s) => (
            <button
              key={s.src}
              role="menuitem"
              aria-label={`Send ${s.alt} sticker`}
              onClick={() => {
                onSelect({ kind: "sticker", src: s.src, alt: s.alt });
                onClose();
              }}
              className="flex h-11 w-11 items-center justify-center rounded-xl transition hover:bg-surface-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.src} alt={s.alt} className="h-9 w-9 object-contain" />
            </button>
          ))}
    </motion.div>
  );
}
