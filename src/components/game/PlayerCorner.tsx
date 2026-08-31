import type { ReactNode } from "react";
import type { MotionValue } from "framer-motion";
import { motion } from "framer-motion";
import { colorForArm } from "@/game/board";
import { animalForSeat } from "@/lib/avatar";
import { IconRobot } from "@/components/lobby/icons";
import { cn } from "@/lib/utils";
import type { Seat } from "@/types/room";

const GOLD = "#FFD400";
const GOLD_DARK = "#C99A00";

// Same 15s clock GameView's real auto-move timer runs on (see AUTO_MOVE_MS
// there) — duplicated here rather than imported since this is purely the
// cosmetic countdown trace, not the source of truth for the actual timeout.
const AUTO_MOVE_MS = 15000;

// Fixed footprint of the name+avatar block (see the wrapper below) — every
// card is this same size regardless of name length or which state it's in,
// so the four corners never shift the board around as turns change.
const CARD_WIDTH = 80;
const CARD_HEIGHT = 70;

// The outer shell's footprint when a <Dice/> is attached (see the `dice`
// prop below) — the name+avatar block above plus the die's own fixed
// 58px (Dice.tsx's CUBE_SIZE), the (tight) gap between them, and this
// shell's own (tight) padding. Hand-matched to the actual classes below,
// same as CARD_WIDTH/HEIGHT, so the trace SVG's rounded corners line up
// with the real border-radius instead of stretching into an ellipse.
const SHELL_WIDTH = 154;
const SHELL_HEIGHT = 66;

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
  // Set (host only — see GameView.tsx) to make this seat tappable, opening
  // that player's manage-player actions instead of a dedicated separate
  // "Players" control.
  onClick?: () => void;
  // The same pausable 0..1 motion value Dice.tsx's own auto-roll countdown
  // drives — passed through only for whichever corner is currently the
  // active roller (see GameView.tsx), so this card's border traces the
  // exact same countdown that used to run around the die itself.
  rollProgress?: MotionValue<number> | null;
  // True only for the active mover's own corner, for the AUTO_MOVE_MS
  // window — a plain declarative trace since (unlike the roll countdown)
  // it's never paused/resumed by touching anything.
  canMove?: boolean;
  // The <Dice/> for whichever corner currently has the turn (see
  // GameView.tsx) — when set, this card's own outline/background grows to
  // enclose it instead of the die sitting next to it as a separate chip,
  // so the two read as one shape. The die's own position/size don't
  // change — only the card's border/fill extends out to meet it.
  dice?: ReactNode;
  // Which side of the name/avatar block the die sits on: true puts it
  // first (dice-then-player, for a right-side corner where the board is
  // to the die's own left), false puts it last (player-then-dice, for a
  // left-side corner). Ignored when `dice` isn't set.
  diceFirst?: boolean;
};

export default function PlayerCorner({
  seat,
  isTurn,
  placement,
  suspended,
  onClick,
  rollProgress,
  canMove,
  dice,
  diceFirst,
}: PlayerCornerProps) {
  if (!seat) return <div style={{ width: CARD_WIDTH, height: CARD_HEIGHT }} />;

  const color = colorForArm(seat.armIndex);
  // The click target (host's "manage this player") is just the name+avatar
  // — not the whole card, and not the die — so it stays a plain <div> at
  // the outer level; only this inner piece becomes a <button>.
  const InnerWrapper = onClick ? "button" : "div";
  const showTrace = isTurn && (rollProgress || canMove);
  const traceW = dice ? SHELL_WIDTH : CARD_WIDTH;
  const traceH = dice ? SHELL_HEIGHT : CARD_HEIGHT;

  const nameAndAvatar = (
    <InnerWrapper
      onClick={onClick}
      aria-label={onClick ? `Manage ${seat.name}` : undefined}
      className={cn(
        "flex shrink-0 flex-col items-center gap-1",
        onClick && "cursor-pointer",
      )}
      style={{ width: CARD_WIDTH }}
    >
      <span
        className="w-full truncate text-center text-sm font-bold leading-tight"
        style={{ color: color.hex }}
        title={seat.name}
      >
        {seat.name}
      </span>

      <span className="relative shrink-0">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full border-2 text-lg leading-none shadow-sm"
          style={{ borderColor: color.hex, backgroundColor: `${color.hex}2E` }}
        >
          {seat.bot && !seat.simulated ? (
            <span style={{ color: color.hex }}>
              <IconRobot className="h-5 w-5" />
            </span>
          ) : (
            animalForSeat(seat.id)
          )}
        </span>
        {placement && placement <= 3 && <PlacementCrown placement={placement} />}
        {suspended && <SuspendedBadge />}
      </span>
    </InnerWrapper>
  );

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center rounded-2xl border shadow-sm transition-shadow",
        dice ? "gap-1 px-1.5 py-1" : "flex-col gap-1 px-1.5 py-1.5",
      )}
      style={{
        width: dice ? undefined : CARD_WIDTH,
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
          viewBox={`0 0 ${traceW} ${traceH}`}
          preserveAspectRatio="none"
        >
          {rollProgress ? (
            <motion.rect
              x="1.5"
              y="1.5"
              width={traceW - 3}
              height={traceH - 3}
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
              width={traceW - 3}
              height={traceH - 3}
              rx="16"
              fill="none"
              stroke={color.hex}
              strokeWidth="3"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: AUTO_MOVE_MS / 1000, ease: "linear" }}
            />
          )}
        </svg>
      )}

      {dice ? (
        diceFirst ? (
          <>
            {dice}
            {nameAndAvatar}
          </>
        ) : (
          <>
            {nameAndAvatar}
            {dice}
          </>
        )
      ) : (
        nameAndAvatar
      )}
    </div>
  );
}
