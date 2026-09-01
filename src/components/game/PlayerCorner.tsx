import { useState, type ReactNode } from "react";
import type { MotionValue } from "framer-motion";
import { AnimatePresence, motion } from "framer-motion";
import { colorForArm } from "@/game/board";
import { animalForSeat } from "@/lib/avatar";
import { IconRobot } from "@/components/lobby/icons";
import { IconPalette } from "@/components/game/gameIcons";
import ReactionPicker, { type Reaction } from "@/components/game/ReactionPicker";
import { cn } from "@/lib/utils";
import type { Seat } from "@/types/room";

const GOLD = "#FFD400";
const GOLD_DARK = "#C99A00";
// A clearly distinct accent from GOLD, the 4 arm colors, and ink-muted grey
// — flags a seat currently being auto-played because it's disconnected
// (see DisconnectedBadge below), never used for anything else.
const AWAY = "#F59E0B";

// Fallback only for a caller that doesn't pass moveTimeoutMs (e.g. the dev
// test harness) — real play always passes the seat's actual decayed
// deadline (see GameView.tsx).
const DEFAULT_MOVE_TIMEOUT_MS = 15000;

// The avatar circle's diameter — sized to match Dice.tsx's CUBE_SIZE
// exactly, so the avatar and the die read as the same object scale
// instead of a small icon next to a much bigger cube.
const AVATAR_SIZE = 48;

// The reserved dice slot's own size — same as AVATAR_SIZE/CUBE_SIZE, kept
// as its own name since it sizes an empty placeholder, not the die itself.
const DICE_SLOT_SIZE = 48;

// Fixed footprint of the whole card — every seat's corner is this exact
// same width AND height at all times, whether or not it currently holds
// the die (see the `dice` prop and the always-reserved slot below), so
// nothing about a corner's box ever changes size as turns pass; only its
// border/glow (isTurn) and the die mounting into its slot change. Two rows
// (name on top, avatar+dice-slot side by side below) rather than the die
// pushing the whole card wider — CARD_WIDTH is sized to row 2's content
// (AVATAR_SIZE + a tight gap + DICE_SLOT_SIZE) plus padding, hand-matched
// to the actual classes below so the trace SVG's rounded corners line up
// with the real border-radius instead of stretching into an ellipse.
const CARD_WIDTH = 112;
const CARD_HEIGHT = 82;

// Drawn in code rather than an image asset — a simple 3-peak crown with
// the finishing place (1/2/3) badged at its base, positioned over the
// avatar's corner the same way AccountBar badges its friend-request count.
function PlacementCrown({ placement }: { placement: number }) {
  return (
    <div className="absolute -top-2 -right-2 drop-shadow">
      <svg width="20" height="17" viewBox="0 0 24 20" aria-hidden>
        <path
          d="M2,18 L2,9 L7,13 L12,4 L17,13 L22,9 L22,18 Z"
          fill={GOLD}
          stroke={GOLD_DARK}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        <circle cx="2" cy="9" r="1.6" fill={GOLD_DARK} />
        <circle cx="12" cy="4" r="1.8" fill={GOLD_DARK} />
        <circle cx="22" cy="9" r="1.6" fill={GOLD_DARK} />
      </svg>
      <span className="absolute -bottom-1.5 left-1/2 flex h-3.5 w-3.5 -translate-x-1/2 items-center justify-center rounded-full bg-ink text-[9px] font-bold text-white">
        {placement}
      </span>
    </div>
  );
}

// A small paused/pause-bars badge over the avatar's opposite corner from
// the placement crown — replaces the old inline "Paused" text line so a
// suspended seat's card stays exactly the same height as every other.
function SuspendedBadge() {
  return (
    <span
      className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-ink-muted text-white shadow"
      aria-hidden
    >
      <svg width="7" height="7" viewBox="0 0 8 8">
        <rect x="1" y="0" width="2" height="8" fill="currentColor" />
        <rect x="5" y="0" width="2" height="8" fill="currentColor" />
      </svg>
    </span>
  );
}

// Same corner/size as SuspendedBadge, but a distinct amber (AWAY) — a
// disconnected seat is being auto-played like a bot right now (see
// server.js's sweepTurnTimeouts/currentAutoTarget), which is a different,
// more urgent state than a host-paused seat, so it gets its own color
// rather than reusing the grey pause badge.
function DisconnectedBadge() {
  return (
    <span
      className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full text-white shadow"
      style={{ backgroundColor: AWAY }}
      aria-label="Disconnected — playing itself until they're back"
    >
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
        <path
          d="M4 1.5v3l2 1.2"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="4" cy="4" r="3.3" stroke="currentColor" strokeWidth="0.9" />
      </svg>
    </span>
  );
}

type PlayerCornerProps = {
  seat: Seat | null;
  isTurn: boolean;
  // 1/2/3 once this seat has finished (see placementFor in
  // src/game/engine.js); null while still playing or for the one loser.
  placement?: number | null;
  // Paused by the host mid-game — see suspendSeat in src/game/engine.js.
  // Their tokens stay on the board (and stay capturable); they just get
  // no turns and read as dimmed here, same as a disconnected seat.
  suspended?: boolean;
  // The same pausable 0..1 motion value Dice.tsx's own auto-roll countdown
  // drives — passed through only for whichever corner is currently the
  // active roller (see GameView.tsx), so this card's border traces the
  // exact same countdown that used to run around the die itself.
  rollProgress?: MotionValue<number> | null;
  // True only for the active mover's own corner, for the moveTimeoutMs
  // window — a plain declarative trace since (unlike the roll countdown)
  // it's never paused/resumed by touching anything.
  canMove?: boolean;
  // How long that trace takes to fill — the seat's own decayed move
  // deadline (see INACTIVITY_TIMEOUTS_MS in src/game/engine.js), passed
  // down by GameView.tsx. Purely visual, same as Dice.tsx's autoRollMs:
  // the actual auto-move only ever happens server-side.
  moveTimeoutMs?: number;
  // Truthy for whichever corner currently has the turn (see GameView.tsx) —
  // its own reserved dice slot (see DICE_SLOT_SIZE) then renders blank
  // instead of the idle sticker button, since GameView.tsx renders the
  // actual <Dice/> itself as a single floating overlay positioned over
  // that slot (so it can animate traveling between corners instead of
  // hard-cutting between them) rather than mounting it as a child here.
  // Still accepts a real node too (the dev test-mode harness in
  // TestModeView.tsx mounts <Dice/> the older, simpler way, with no
  // handoff animation).
  dice?: ReactNode;
  // Reports this corner's own reserved dice-slot element back to the
  // caller, regardless of whether `dice` is set — GameView.tsx uses this
  // to know every corner's on-screen position at all times, so it can
  // animate the floating die from whichever corner it's leaving to
  // whichever corner it's arriving at.
  diceSlotRef?: (el: HTMLDivElement | null) => void;
  // Which side of the avatar the dice slot sits on: true puts it first
  // (dice-then-avatar, for a right-side corner where the board is to the
  // die's own left), false puts it last (avatar-then-dice, for a
  // left-side corner) — either way the die ends up on the board-facing
  // side. Also which edge the name row aligns to (matching the avatar
  // below it) and which side the sticker picker opens toward, so it
  // doesn't spill off a corner sitting near the screen edge.
  diceFirst?: boolean;
  // True for a bottom-row corner (near the bottom of the viewport) — opens
  // the sticker picker upward instead of downward, so it doesn't spill off
  // the bottom of the screen. Ignored when `onSendSticker` isn't set.
  bottomRow?: boolean;
  // Lets anyone (not just the host) send a sticker that pops up at this
  // seat's home/yard on the board instead of center-screen — see the
  // sticker button that fills the dice slot whenever this corner isn't
  // the current roller. Omit to just leave that slot blank when idle.
  onSendSticker?: (seatId: string, reaction: Reaction) => void;
};

export default function PlayerCorner({
  seat,
  isTurn,
  placement,
  suspended,
  rollProgress,
  canMove,
  moveTimeoutMs = DEFAULT_MOVE_TIMEOUT_MS,
  dice,
  diceSlotRef,
  diceFirst,
  bottomRow,
  onSendSticker,
}: PlayerCornerProps) {
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);

  if (!seat) return <div style={{ width: CARD_WIDTH, height: CARD_HEIGHT }} />;

  const color = colorForArm(seat.armIndex);
  const showTrace = isTurn && (rollProgress || canMove);

  const avatar = (
    <div className="relative shrink-0">
      <span
        className="flex items-center justify-center rounded-full border-2 text-2xl leading-none shadow-sm"
        style={{
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          borderColor: color.hex,
          backgroundColor: `${color.hex}2E`,
        }}
      >
        {seat.bot && !seat.simulated ? (
          <span style={{ color: color.hex }}>
            <IconRobot className="h-6 w-6" />
          </span>
        ) : (
          animalForSeat(seat.id)
        )}
      </span>
      {placement && placement <= 3 && <PlacementCrown placement={placement} />}
      {/* Disconnected takes priority when somehow both are true — it's the
          more urgent state (this seat is actively being auto-played right
          now, not just paused). */}
      {!seat.connected ? <DisconnectedBadge /> : suspended && <SuspendedBadge />}
      {/* Deliberately NOT in the dice slot below (see diceSlot) — that used
          to be where this button lived (whenever this corner wasn't the
          current roller), reusing the exact geometry player-management
          deliberately moved off of because it caught mistaps meant for the
          die (see the name row's comment further down). Anchored to the
          avatar's own free corner instead (crown takes top-right,
          suspended/disconnected take bottom-right), so it can never end up
          where the die appears regardless of turn state. */}
      {!dice && onSendSticker && (
        <div className="absolute -top-1 -left-1">
          <button
            type="button"
            onClick={() => setStickerPickerOpen((v) => !v)}
            aria-label={`Send a sticker to ${seat.name}`}
            aria-expanded={stickerPickerOpen}
            className="flex h-5 w-5 items-center justify-center rounded-full border border-line bg-surface text-ink-muted shadow transition hover:text-ink"
          >
            <IconPalette className="h-3 w-3" />
          </button>
          <AnimatePresence>
            {stickerPickerOpen && (
              <ReactionPicker
                mode="sticker"
                align={diceFirst ? "right" : "left"}
                vAlign={bottomRow ? "top" : "bottom"}
                onSelect={(reaction) => onSendSticker(seat.id, reaction)}
                onClose={() => setStickerPickerOpen(false)}
              />
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );

  // Always-reserved footprint for the die, so a corner's box never resizes
  // as the die arrives or leaves it — just the die-or-blank now that the
  // per-player sticker trigger lives on the avatar instead (see above).
  // diceSlotRef lets GameView track this corner's on-screen position for
  // the dice handoff animation (issue #21), even while this corner is
  // blank.
  const diceSlot = (
    <div ref={diceSlotRef} className="shrink-0" style={{ width: DICE_SLOT_SIZE, height: DICE_SLOT_SIZE }}>
      {dice}
    </div>
  );

  return (
    <div
      className="relative flex shrink-0 flex-col items-center gap-1 rounded-2xl border px-1.5 py-1.5 shadow-sm transition-shadow"
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        backgroundColor: `${color.hex}1A`,
        borderColor: isTurn ? color.hex : `${color.hex}40`,
        boxShadow: isTurn ? `0 0 0 3px ${color.hex}33, 0 2px 6px ${color.hex}26` : undefined,
        opacity: seat.connected && !suspended ? 1 : 0.55,
      }}
    >
      {showTrace && (
        // No rotation here — a rect's pathLength naturally starts at its
        // top-left corner and traces clockwise, which is a fine start
        // point on its own; CSS-rotating this box (as it used to) badly
        // distorted the wide dice-attached shell, since rotating a
        // non-square element 90° no longer fits its own layout box.
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`}
          preserveAspectRatio="none"
        >
          {rollProgress ? (
            <motion.rect
              x="1.5"
              y="1.5"
              width={CARD_WIDTH - 3}
              height={CARD_HEIGHT - 3}
              rx="16"
              fill="none"
              stroke={color.hex}
              strokeWidth="3"
              strokeLinecap="round"
              style={{ pathLength: rollProgress }}
            />
          ) : (
            <motion.rect
              key="move-trace"
              x="1.5"
              y="1.5"
              width={CARD_WIDTH - 3}
              height={CARD_HEIGHT - 3}
              rx="16"
              fill="none"
              stroke={color.hex}
              strokeWidth="3"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: moveTimeoutMs / 1000, ease: "linear" }}
            />
          )}
        </svg>
      )}

      {/* Row 1: name, full card width, aligned to the same edge as the
          avatar below it (see `diceFirst`) rather than centered. Not
          clickable — managing a player now happens from the game bar's
          "more" menu (see GameMenu.tsx's Players list) instead of tapping
          the card directly, which was catching mistaps meant for the die
          right next to it. */}
      <span
        className={cn(
          "block w-full shrink-0 truncate text-sm font-bold leading-tight",
          diceFirst ? "text-right" : "text-left",
        )}
        style={{ color: color.hex }}
        title={seat.name}
      >
        {seat.name}
      </span>

      {/* Row 2: avatar and the (always-reserved) dice slot, side by side. */}
      <div className="flex shrink-0 items-center gap-1">
        {diceFirst ? (
          <>
            {diceSlot}
            {avatar}
          </>
        ) : (
          <>
            {avatar}
            {diceSlot}
          </>
        )}
      </div>
    </div>
  );
}
