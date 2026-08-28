import type { ReactNode } from "react";
import { IconUsers, IconClock, IconTrophy, IconExit } from "@/components/lobby/icons";
import { IconPerson } from "@/components/home/icons";

// Shared by AccountSheet and DesktopSidebar so both stay in sync — same
// four destinations AccountBar already linked to, just presented richer.
// Colors are the same fixed brand hues used elsewhere (src/game/board.js's
// colorForArm, src/components/brand/Wordmark.tsx) plus the existing
// --color-accent-2 theme token for Leaderboard, rather than new ones.
export const BLUE = "#1565E8";
export const GREEN = "#1F9E4C";
export const VIOLET = "#8b5cf6";
export const GOLD = "var(--color-accent-2)";

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  color: string;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/friends", label: "Friends", icon: <IconUsers />, color: GREEN },
  { href: "/profiles", label: "Manage players", icon: <IconPerson />, color: BLUE },
  { href: "/history", label: "History", icon: <IconClock />, color: VIOLET },
  { href: "/leaderboard", label: "Leaderboard", icon: <IconTrophy />, color: GOLD },
];

export { IconExit };
