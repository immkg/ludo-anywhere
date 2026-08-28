import { colorForArm } from "@/game/board";
import { animalForSeat } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import type { Seat } from "@/types/room";

const GOLD = "#FFD400";
const GOLD_DARK = "#C99A00";

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

type PlayerCornerProps = {
  seat: Seat | null;
  avatarFirst: boolean;
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
};

export default function PlayerCorner({ seat, avatarFirst, isTurn, placement, suspended, onClick }: PlayerCornerProps) {
  if (!seat) return <div className="h-9" />;

  const color = colorForArm(seat.armIndex);
  const avatar = (
    <span className="relative shrink-0">
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full border-2 text-lg leading-none"
        style={{ borderColor: color.hex, backgroundColor: `${color.hex}22` }}
      >
        {animalForSeat(seat.id)}
      </span>
      {placement && placement <= 3 && <PlacementCrown placement={placement} />}
    </span>
  );
  const name = (
    <span
      className={cn("max-w-[6.5rem] truncate text-sm font-semibold", !avatarFirst && "text-right")}
      style={{ color: color.hex }}
      title={seat.name}
    >
      {seat.name}
      {suspended && <span className="ml-1 text-xs font-normal text-ink-muted">(paused)</span>}
    </span>
  );

  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      onClick={onClick}
      className="flex items-center gap-2 rounded-full border px-2 py-1 transition-shadow"
      style={{
        borderColor: isTurn ? color.hex : "transparent",
        boxShadow: isTurn ? `0 0 0 2px ${color.hex}44` : undefined,
        opacity: seat.connected && !suspended ? 1 : 0.5,
      }}
    >
      {avatarFirst ? (
        <>
          {avatar}
          {name}
        </>
      ) : (
        <>
          {name}
          {avatar}
        </>
      )}
    </Wrapper>
  );
}
