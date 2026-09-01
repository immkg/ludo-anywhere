import type { ReactNode } from "react";
import { IconUsers, IconClock, IconTrophy, IconExit } from "@/components/lobby/icons";
import { IconPerson, IconHome } from "@/components/home/icons";

// Shared by AccountSheet and DesktopSidebar so both stay in sync — same
// four destinations AccountBar already linked to, just presented richer.
// Colors are the same fixed brand hues used elsewhere (src/game/board.js's
// colorForArm, src/components/brand/Wordmark.tsx) plus the existing
// --color-accent-2 theme token for Leaderboard, rather than new ones.
export const BLUE = "#1565E8";
export const GREEN = "#1F9E4C";
export const VIOLET = "#8b5cf6";
export const GOLD = "var(--color-accent-2)";
export const ORANGE = "#E8720C";
// Same red already used for the destructive "Sign out" action in
// AccountSheet/DesktopSidebar — reused here so "danger" means one hue
// app-wide instead of each screen picking its own.
export const RED = "#E8262C";

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  color: string;
};

// Ordered by usage frequency: Friends (core social/invite loop) and
// Leaderboard (competitive/retention hook) ahead of History (look-back)
// and Players (local roster setup — least frequent).
export const NAV_ITEMS: NavItem[] = [
  { href: "/friends", label: "Friends", icon: <IconUsers />, color: GREEN },
  { href: "/leaderboard", label: "Leaderboard", icon: <IconTrophy />, color: GOLD },
  { href: "/history", label: "History", icon: <IconClock />, color: VIOLET },
  { href: "/profiles", label: "Players", icon: <IconPerson />, color: BLUE },
];

// Home isn't in NAV_ITEMS itself because its destination differs by
// context — "/" (the real dashboard) for a signed-in AuthenticatedNav,
// "/play" (the guest dashboard) for GuestNav — same split the logo link
// next to it already makes. Callers prepend this to NAV_ITEMS.
export function getHomeItem(href: string): NavItem {
  return { href, label: "Home", icon: <IconHome />, color: ORANGE };
}

export { IconExit };
