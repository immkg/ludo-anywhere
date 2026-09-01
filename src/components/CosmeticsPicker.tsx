"use client";

import clsx from "clsx";
import { useCosmetics } from "@/components/CosmeticsProvider";
import { TOKEN_STYLES, BOARD_FINISHES, DICE_SKINS } from "@/game/cosmetics";

// Same small pill-group look as ThemeToggle.tsx, one row per axis. Every
// option here is free for every player (no entitlement check anywhere in
// this file) — see the PR description for why cosmetics ship without
// gating in this pass.
function OptionGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-full border border-line p-1">
      {options.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          aria-pressed={value === id}
          className={clsx(
            "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
            value === id ? "bg-accent text-white" : "text-ink-muted"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// The free cosmetics picker for issues #23/#29 — token style, board finish,
// dice skin. Placed inline in GameMenu.tsx right below the existing Theme
// row (same per-client/local-only nature, same UI pattern) rather than a
// dedicated settings screen, since none existed to put it in — see the PR
// description for that placement call.
export default function CosmeticsPicker({ className }: { className?: string }) {
  const { tokenStyle, boardFinish, diceSkin, setTokenStyle, setBoardFinish, setDiceSkin } = useCosmetics();

  return (
    <div className={clsx("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">Tokens</p>
        <OptionGroup options={TOKEN_STYLES} value={tokenStyle} onChange={setTokenStyle} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">Board</p>
        <OptionGroup options={BOARD_FINISHES} value={boardFinish} onChange={setBoardFinish} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">Dice</p>
        <OptionGroup options={DICE_SKINS} value={diceSkin} onChange={setDiceSkin} />
      </div>
    </div>
  );
}
