import { colorForArm } from "@/game/board";
import { animalForSeat } from "@/lib/avatar";
import type { Seat } from "@/types/room";

type PlayerCornerProps = {
  seat: Seat | null;
  avatarFirst: boolean;
  isTurn: boolean;
};

export default function PlayerCorner({ seat, avatarFirst, isTurn }: PlayerCornerProps) {
  if (!seat) return <div className="h-9" />;

  const color = colorForArm(seat.armIndex);
  const avatar = (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-lg leading-none"
      style={{ borderColor: color.hex, backgroundColor: `${color.hex}22` }}
    >
      {animalForSeat(seat.id)}
    </span>
  );
  const name = (
    <span
      className="max-w-[6.5rem] truncate text-sm font-semibold"
      style={{ color: color.hex }}
      title={seat.name}
    >
      {seat.name}
    </span>
  );

  return (
    <div
      className="flex items-center gap-2 rounded-full border px-2 py-1 transition-shadow"
      style={{
        borderColor: isTurn ? color.hex : "transparent",
        boxShadow: isTurn ? `0 0 0 2px ${color.hex}44` : undefined,
        opacity: seat.connected ? 1 : 0.5,
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
    </div>
  );
}
