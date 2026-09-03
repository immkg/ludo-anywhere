"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import AppHeader from "@/components/nav/AppHeader";
import DesktopSidebar from "@/components/nav/DesktopSidebar";
import AccountSheet from "@/components/nav/AccountSheet";
import MobileTabBar from "@/components/nav/MobileTabBar";
import { NAV_ITEMS, getHomeItem } from "@/components/nav/navItems";
import { IconMenu } from "@/components/nav/icons";

export type AuthenticatedNavProps = {
  displayName: string;
  email: string | null;
  userImage: string | null;
  pendingRequestCount: number;
  children: ReactNode;
};

// Wraps a page's existing content with the account navigation chrome:
// AppHeader + MobileTabBar stacked above/below the content on narrow
// viewports, DesktopSidebar beside it at md+ — all three are always
// mounted, which is visible is pure CSS (AppHeader/MobileTabBar are
// md:hidden, DesktopSidebar is hidden md:flex), avoiding a JS viewport
// check and the layout-shift/hydration-mismatch risk that comes with one.
// Only dashboard-style pages (Home, Friends, Players, History,
// Leaderboard, Pricing) render this wrapper — full-screen game pages
// (create, join, room/[roomId]) render outside it entirely, so the tab
// bar never shows up mid-game without any extra route matching here.
// The page's own content keeps whatever layout it already had — this only
// adds navigation around it, never a dashboard grid.
export default function AuthenticatedNav({ displayName, email, userImage, pendingRequestCount, children }: AuthenticatedNavProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Bottom bar's 3 primary destinations; Players/History stay one tap away
  // in the "More" sheet, which also still lists all of NAV_ITEMS — same
  // duplication the desktop sidebar already has no issue with.
  const tabItems = [getHomeItem("/"), ...NAV_ITEMS.slice(0, 2)];

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppHeader
        userImage={userImage}
        pendingRequestCount={pendingRequestCount}
        menuOpen={menuOpen}
        onOpenMenu={() => setMenuOpen(true)}
      />
      <DesktopSidebar displayName={displayName} email={email} userImage={userImage} />
      <div className="min-w-0 flex-1 pb-[calc(3.5rem_+_env(safe-area-inset-bottom))] md:pb-0">{children}</div>
      <MobileTabBar items={tabItems} more={{ label: "More", icon: <IconMenu />, onClick: () => setMenuOpen(true) }} />
      <AccountSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        displayName={displayName}
        email={email}
        userImage={userImage}
      />
    </div>
  );
}
