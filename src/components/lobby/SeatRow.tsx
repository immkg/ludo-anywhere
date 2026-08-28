"use client";

import { useState } from "react";
import { colorForArm } from "@/game/board";
import { cn } from "@/lib/utils";
import Input from "@/components/ui/Input";
import type { PlayerProfile } from "@/types/profile";

export type SeatDraft = { profileId: string | null };

export function defaultSeats(count: number, previous: SeatDraft[]): SeatDraft[] {
  return Array.from({ length: count }, (_, i) => previous[i] ?? { profileId: null });
}

const NEW_PROFILE = "__new__";

type SeatRowProps = {
  index: number;
  seat: SeatDraft;
  previewArmIndex: number | null;
  profiles: PlayerProfile[];
  onChange: (seat: SeatDraft) => void;
  onCreateProfile: (name: string, email: string) => Promise<PlayerProfile>;
  // JoinRoom shows this to preview the color a seat will be assigned;
  // WaitingRoom's Add Player modal has no such preview to give (colors
  // there depend on join order at the time), so it hides the swatch.
  showColorSwatch?: boolean;
  // Defaults to "Player {index + 1}", which reads correctly for JoinRoom's
  // fixed-position seat list but is meaningless in WaitingRoom's Add Player
  // modal (there's no seat number to speak of — override it there).
  placeholder?: string;
};

export default function SeatRow({
  index,
  seat,
  previewArmIndex,
  profiles,
  onChange,
  onCreateProfile,
  showColorSwatch = true,
  placeholder,
}: SeatRowProps) {
  const color = previewArmIndex == null ? null : colorForArm(previewArmIndex);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSelect = (value: string) => {
    if (value === NEW_PROFILE) {
      setAdding(true);
      return;
    }
    onChange({ profileId: value || null });
  };

  const handleAdd = async () => {
    setSaving(true);
    setError(null);
    try {
      const profile = await onCreateProfile(name, email);
      onChange({ profileId: profile.id });
      setAdding(false);
      setName("");
      setEmail("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add player");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
      <div className="flex items-center gap-3">
        {showColorSwatch && (
          <span
            className="h-9 w-9 shrink-0 rounded-full border border-line"
            style={{ backgroundColor: color?.hex ?? "transparent" }}
            title={color?.label ?? "Assigned when the room fills"}
          />
        )}
        {adding ? (
          <div className="flex flex-1 flex-col gap-2">
            <Input placeholder="Name" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
            <Input
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        ) : (
          <select
            className="h-12 min-w-0 flex-1 rounded-2xl border border-line bg-surface-2 px-4 text-base text-ink focus:outline-none focus:ring-2 focus:ring-accent"
            value={seat.profileId ?? ""}
            onChange={(e) => handleSelect(e.target.value)}
          >
            <option value="" disabled>
              {placeholder ?? `Player ${index + 1}`}
            </option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value={NEW_PROFILE}>+ Add new player…</option>
          </select>
        )}
      </div>

      {adding && (
        <div className={cn("flex items-center gap-4", showColorSwatch && "pl-12")}>
          <button
            type="button"
            onClick={handleAdd}
            disabled={saving || !name.trim() || !email.trim()}
            className="text-sm font-semibold text-accent disabled:opacity-40"
          >
            {saving ? "Adding…" : "Add player"}
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="text-sm font-semibold text-ink-muted underline"
          >
            Cancel
          </button>
        </div>
      )}

      {error && <p className={cn("text-xs text-accent", showColorSwatch && "pl-12")}>{error}</p>}
    </div>
  );
}
