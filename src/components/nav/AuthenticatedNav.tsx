"use client";

import type { ReactNode } from "react";
import AppHeader from "@/components/nav/AppHeader";
import DesktopSidebar from "@/components/nav/DesktopSidebar";

export type AuthenticatedNavProps = {
  displayName: string;
  email: string | null;
  userImage: string | null;
  pendingRequestCount: number;
  children: ReactNode;
};

// Wraps a page's existing content with the account navigation chrome:
// AppHeader (mobile top bar + its AccountSheet) stacked above the content
// on narrow viewports, DesktopSidebar beside it at md+ — both are always
// mounted, which of the two is visible is pure CSS (AppHeader is
// md:hidden, DesktopSidebar is hidden md:flex), avoiding a JS viewport
// check and the layout-shift/hydration-mismatch risk that comes with one.
// The page's own content keeps whatever layout it already had — this only
// adds navigation around it, never a dashboard grid.
export default function AuthenticatedNav({ displayName, email, userImage, pendingRequestCount, children }: AuthenticatedNavProps) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppHeader displayName={displayName} email={email} userImage={userImage} pendingRequestCount={pendingRequestCount} />
      <DesktopSidebar displayName={displayName} email={email} userImage={userImage} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
