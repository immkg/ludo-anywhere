// Subtle medal tint for the top 3 — never bigger or louder than the
// numeral itself, which stays the actual legible rank.
const MEDAL_COLORS: Record<number, string> = {
  1: "var(--color-accent-2)", // gold
  2: "#9CA3AF", // silver — neutral, not a brand hue
  3: "#C97B4A", // bronze
};

export default function RankBadge({ rank }: { rank: number }) {
  const color = MEDAL_COLORS[rank];
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold"
      style={color ? { backgroundColor: `${color}26`, color } : undefined}
    >
      <span className={color ? "" : "text-ink-muted"}>{rank}</span>
    </span>
  );
}
