"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import AppIconMark from "@/components/brand/AppIconMark";
import Wordmark from "@/components/brand/Wordmark";
import CreditBalance from "@/components/nav/CreditBalance";
import NavigationItem from "@/components/nav/NavigationItem";
import { NAV_ITEMS, IconExit } from "@/components/nav/navItems";
import { IconAppearance } from "@/components/nav/icons";
import ThemeToggle from "@/components/ThemeToggle";

type DesktopSidebarProps = {
  displayName: string;
  email: string | null;
  userImage: string | null;
};

// Persistent left nav for tablet/desktop widths — navigation only; the
// page's own content (to the right of this) keeps its existing layout, see
// AuthenticatedNav.tsx.
export default function DesktopSidebar({ displayName, email, userImage }: DesktopSidebarProps) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-surface px-4 py-5 md:flex lg:w-72">
      <Link href="/" className="flex items-center gap-2">
        <AppIconMark className="h-7 w-7" />
        <Wordmark className="text-xl" />
      </Link>

      <div className="flex items-center gap-3">
        {userImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={userImage} alt="" referrerPolicy="no-referrer" className="h-11 w-11 shrink-0 rounded-full" />
        ) : (
          <span className="h-11 w-11 shrink-0 rounded-full bg-surface-2" />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-ink">{displayName}</p>
          {email && <p className="truncate text-xs text-ink-muted">{email}</p>}
        </div>
      </div>

      <CreditBalance />

      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <NavigationItem key={item.href} {...item} />
        ))}
      </nav>

      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <div className="flex flex-col gap-2 px-3 py-2.5">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-muted">
              <IconAppearance className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold text-ink">Appearance</span>
          </div>
          <ThemeToggle />
        </div>

        <button
          onClick={() => signOut()}
          className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink transition hover:bg-[#E8262C]/10"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E8262C]/10 text-[#E8262C]">
            <IconExit className="h-4 w-4" />
          </span>
          Sign out
        </button>
      </div>
    </aside>
  );
}
