import { GREEN, RED } from "@/components/nav/navItems";
import { WIN_POINTS, LOSS_POINTS } from "@/lib/scoring";

export default function ScoringInfoPanel() {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface-2/60 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-bold text-ink">How scoring works</p>
        <p className="text-xs text-ink-muted sm:text-sm">
          Win games to climb. Every loss costs a few points.
        </p>
      </div>
      <div className="flex shrink-0 gap-4 text-sm font-bold">
        <span style={{ color: GREEN }}>Win +{WIN_POINTS}</span>
        <span style={{ color: RED }}>Loss {LOSS_POINTS}</span>
      </div>
    </div>
  );
}
