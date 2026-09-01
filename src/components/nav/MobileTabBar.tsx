"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/components/nav/navItems";

type MoreTab =
  | { label: string; icon: ReactNode; href: string; onClick?: never }
  | { label: string; icon: ReactNode; onClick: () => void; href?: never };

type MobileTabBarProps = {
  items: NavItem[];
  // Omitted on pages with no account sheet / sign-in CTA to hand it off to
  // (e.g. the create/join forms) — those just get plain escape-hatch links.
  more?: MoreTab;
};

// Persistent bottom tab bar for mobile dashboard pages only (Home,
// Friends, Leaderboard, ...) — mounted by AuthenticatedNav/GuestNav, which
// only wrap dashboard-style pages. Full-screen game pages (create, join,
// room/[roomId]) render outside those wrappers entirely, so they never get
// this bar without any extra route-matching logic here.
export default function MobileTabBar({ items, more }: MobileTabBarProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.map((item) => (
        <Tab
          key={item.href}
          href={item.href}
          label={item.label}
          icon={item.icon}
          active={item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`)}
        />
      ))}
      {more?.href ? (
        <Tab href={more.href} label={more.label} icon={more.icon} active={pathname === more.href} />
      ) : more ? (
        <button
          type="button"
          onClick={more.onClick}
          aria-haspopup="dialog"
          className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-ink-muted"
        >
          <span className="flex h-6 w-6 items-center justify-center [&>svg]:h-5 [&>svg]:w-5">{more.icon}</span>
          <span className="text-[11px] font-semibold">{more.label}</span>
        </button>
      ) : null}
    </nav>
  );
}

function Tab({ href, label, icon, active }: { href: string; label: string; icon: ReactNode; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-1.5",
        active ? "text-ink" : "text-ink-muted"
      )}
    >
      <span className={cn("flex h-6 w-6 items-center justify-center [&>svg]:h-5 [&>svg]:w-5", active && "font-bold")}>{icon}</span>
      <span className={cn("text-[11px]", active ? "font-bold" : "font-semibold")}>{label}</span>
    </Link>
  );
}
