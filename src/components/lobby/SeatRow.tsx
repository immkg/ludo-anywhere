"use client";

import { colorForArm } from "@/game/board";
import Input from "@/components/ui/Input";

export type SeatDraft = { name: string };

export function defaultSeats(count: number, previous: SeatDraft[]): SeatDraft[] {
  return Array.from({ length: count }, (_, i) => previous[i] ?? { name: "" });
}

type SeatRowProps = {
  index: number;
  seat: SeatDraft;
  previewArmIndex: number | null;
  onChange: (seat: SeatDraft) => void;
};

export default function SeatRow({ index, seat, previewArmIndex, onChange }: SeatRowProps) {
  const color = previewArmIndex == null ? null : colorForArm(previewArmIndex);

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
      <span
        className="h-9 w-9 shrink-0 rounded-full border border-line"
        style={{ backgroundColor: color?.hex ?? "transparent" }}
        title={color?.label ?? "Assigned when the room fills"}
      />
      <Input
        placeholder={`Player ${index + 1} name`}
        value={seat.name}
        maxLength={20}
        onChange={(e) => onChange({ name: e.target.value })}
      />
    </div>
  );
}
