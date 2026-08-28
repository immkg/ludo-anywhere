// Lightweight player profiles (src/types/profile.ts) have no image — only
// the signed-in user's own profile can pass one down (from Google auth).
// Everyone else gets a deterministic colored-initials circle instead, using
// the same fixed brand hues as navItems.tsx so "danger" and "person" colors
// stay app-wide, not per-screen.
import { BLUE, GREEN, VIOLET, GOLD, RED } from "@/components/nav/navItems";

const PALETTE = [BLUE, GREEN, VIOLET, GOLD, RED, "#0EA5A4"];

function colorForSeed(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)).toUpperCase();
}

const SIZES = {
  sm: "h-11 w-11 text-sm",
  md: "h-14 w-14 text-base",
} as const;

export default function PlayerAvatar({
  name,
  email,
  image,
  size = "sm",
}: {
  name: string;
  email: string;
  image?: string | null;
  size?: keyof typeof SIZES;
}) {
  if (image) {
    return (
      <img
        src={image}
        alt=""
        referrerPolicy="no-referrer"
        className={`${SIZES[size]} shrink-0 rounded-full border border-line object-cover`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`flex ${SIZES[size]} shrink-0 items-center justify-center rounded-full font-bold text-white`}
      style={{ backgroundColor: colorForSeed(email || name) }}
    >
      {initialsFor(name)}
    </span>
  );
}
