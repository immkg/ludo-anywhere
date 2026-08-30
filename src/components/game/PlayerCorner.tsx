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

// Fixed card footprint (see the outer wrapper below) — every card is this
// same size regardless of name length or which state it's in, so the four
// corners never shift the board around as turns change. The trace SVG's
// viewBox below is hand-matched to this box (not a 0..100 abstraction) so
// its rounded corners trace the actual border radius instead of stretching
// into an ellipse.
const CARD_WIDTH = 80;
const CARD_HEIGHT = 76;

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
};

export default function PlayerCorner({
  seat,
  isTurn,
  placement,
  suspended,
  onClick,
  rollProgress,
  canMove,
}: PlayerCornerProps) {
  if (!seat) return <div style={{ width: CARD_WIDTH, height: CARD_HEIGHT }} />;

  const color = colorForArm(seat.armIndex);
  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      onClick={onClick}
      aria-label={onClick ? `Manage ${seat.name}` : undefined}
      className={cn(
        "relative flex shrink-0 flex-col items-center gap-1 rounded-2xl border px-2 py-2 shadow-sm transition-shadow",
        onClick && "cursor-pointer",
      )}
      style={{
        width: CARD_WIDTH,
        backgroundColor: `${color.hex}1A`,
        borderColor: isTurn ? color.hex : `${color.hex}40`,
        boxShadow: isTurn ? `0 0 0 3px ${color.hex}33, 0 2px 6px ${color.hex}26` : undefined,
        opacity: seat.connected && !suspended ? 1 : 0.55,
      }}
    >
      {isTurn && (rollProgress || canMove) && (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
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
              transition={{ duration: AUTO_MOVE_MS / 1000, ease: "linear" }}
            />
          )}
        </svg>
      )}

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
          {seat.bot ? (
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
    </Wrapper>
  );
}
