"use client";

import Link from "next/link";
import AppIconMark from "@/components/brand/AppIconMark";
import Wordmark from "@/components/brand/Wordmark";
import ShareInviteButton from "@/components/nav/ShareInviteButton";
import { IconBell, IconPerson } from "@/components/home/icons";

type AppHeaderProps = {
  userImage: string | null;
  pendingRequestCount: number;
  menuOpen: boolean;
  onOpenMenu: () => void;
};

// Mobile-only top bar. The avatar button opens the account sheet — state
// is owned by AuthenticatedNav so MobileTabBar's "More" tab can open the
// same sheet instance instead of each mounting its own.
export default function AppHeader({ userImage, pendingRequestCount, menuOpen, onOpenMenu }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-2 border-b border-line bg-surface px-3 pt-[env(safe-area-inset-top)] md:hidden">
      <Link href="/" className="flex items-center gap-1.5">
        <AppIconMark className="h-6 w-6" />
        <Wordmark className="text-base" />
      </Link>
      <div className="flex shrink-0 items-center gap-1">
        <ShareInviteButton source="nav" variant="compact" />
        <Link
          href="/friends"
          aria-label={pendingRequestCount > 0 ? `Notifications, ${pendingRequestCount} pending` : "Notifications"}
          className="relative flex h-11 w-11 items-center justify-center rounded-full text-ink-muted"
        >
          <IconBell className="h-5 w-5" />
          {pendingRequestCount > 0 && (
            <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
              {pendingRequestCount}
            </span>
          )}
        </Link>
        <button
          onClick={onOpenMenu}
          aria-label="Open account menu"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          className="flex h-11 w-11 shrink-0 items-center justify-center"
        >
          {userImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={userImage} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-ink-muted">
              <IconPerson className="h-4 w-4" />
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
