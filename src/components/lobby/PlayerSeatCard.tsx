import { colorForArm } from "@/game/board";
import { IconCrown, IconPlus, IconX } from "@/components/lobby/icons";
import type { Seat } from "@/types/room";

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

// A filled seat: color identity comes straight from the seat's assigned
// arm (colorForArm), the same color it'll play as once the game starts.
export function OccupiedSeatCard({
  seat,
  isMine,
  isHostSeat,
  canRemove,
  onRemove,
}: {
  seat: Seat;
  isMine: boolean;
  isHostSeat: boolean;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const color = colorForArm(seat.armIndex);

  return (
    <div
      className="relative flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border-2 px-3 pb-3 pt-7 text-center shadow-sm sm:gap-2 sm:px-4 sm:pb-4"
      style={{ borderColor: color.hex, backgroundColor: `${color.hex}17` }}
    >
      {isMine && (
        <span className="absolute left-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          You
        </span>
      )}
      {canRemove && (
        <button
          onClick={onRemove}
          aria-label={`Remove ${seat.name}`}
          className="absolute right-0.5 top-0.5 flex h-11 w-11 items-center justify-center rounded-full text-ink-muted hover:text-accent"
        >
          <IconX className="h-4 w-4" />
        </button>
      )}
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-extrabold text-white sm:h-14 sm:w-14 sm:text-xl"
        style={{ backgroundColor: color.hex }}
        aria-hidden
      >
        {initial(seat.name)}
      </span>
      <p className="w-full truncate text-sm font-bold text-ink sm:text-base" title={seat.name}>
        {seat.name}
      </p>
      <p className="flex items-center gap-1 text-xs font-semibold" style={{ color: color.hex }}>
        {isHostSeat ? (
          <>
            <IconCrown className="h-3 w-3" /> Host
          </>
        ) : (
          "Joined"
        )}
      </p>
      {!seat.connected && <p className="text-[11px] text-ink-muted">Offline</p>}
    </div>
  );
}

// An open slot: the "+" is tinted with the color that seat would take on if
// filled right now (armForSeatIndex), so the empty grid still previews the
// board's color layout without claiming an identity nothing occupies yet.
export function EmptySeatCard({
  seatNumber,
  previewColorHex,
  onAdd,
}: {
  seatNumber: number;
  previewColorHex: string;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex min-h-[44px] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-line bg-surface px-3 py-4 text-center transition hover:border-accent/50 sm:gap-2 sm:py-5"
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white sm:h-12 sm:w-12"
        style={{ backgroundColor: previewColorHex }}
        aria-hidden
      >
        <IconPlus className="h-5 w-5" />
      </span>
      <p className="text-sm font-bold text-ink sm:text-base">Add Player</p>
      <p className="text-[11px] text-ink-muted">Seat {seatNumber}</p>
    </button>
  );
}
