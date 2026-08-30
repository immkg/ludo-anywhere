"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn } from "next-auth/react";
import AppIconMark from "@/components/brand/AppIconMark";
import Wordmark from "@/components/brand/Wordmark";
import NavigationItem from "@/components/nav/NavigationItem";
import { NAV_ITEMS } from "@/components/nav/navItems";
import { IconAppearance } from "@/components/nav/icons";
import ThemeToggle from "@/components/ThemeToggle";

// Logged-out counterpart to AuthenticatedNav — same page chrome (mobile top
// bar + persistent desktop sidebar) and the same NAV_ITEMS, so every gated
// page keeps its normal shell for a signed-out visitor instead of bouncing
// them away. No avatar/credits/sign-out (there's no account yet); a
// "Continue with Google" CTA takes their place.
export default function GuestNav({ children }: { children: ReactNode }) {
  // A signed-in visitor's logo click lands on "/", which is their dashboard
  // (see src/app/page.tsx). "/" is just the marketing landing page for a
  // guest, though — their dashboard equivalent is "/play" (GuestDashboard)
  // — so send the logo there instead to match the same "logo = home base"
  // expectation.
  const pathname = usePathname();
  const callbackUrl = pathname !== "/" ? pathname : undefined;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-line bg-surface px-3 md:hidden">
        <Link href="/play" className="flex items-center gap-1.5">
          <AppIconMark className="h-6 w-6" />
          <Wordmark className="text-base" />
        </Link>
        <button
          onClick={() => signIn("google", { callbackUrl })}
          className="flex h-9 items-center gap-1.5 rounded-full bg-accent text-white shadow-lg shadow-accent/30 px-3 text-xs font-semibold"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/icon-google.png" alt="" className="h-4 w-4" />
          Sign in
        </button>
      </header>

      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-surface px-4 py-5 md:flex lg:w-72">
        <Link href="/play" className="flex items-center gap-2">
          <AppIconMark className="h-7 w-7" />
          <Wordmark className="text-xl" />
        </Link>

        <button
          onClick={() => signIn("google", { callbackUrl })}
          className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 px-3 py-2.5 text-left"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/icon-google.png" alt="" className="h-6 w-6 shrink-0" />
          <span className="min-w-0">
            <span className="block text-sm font-bold text-ink">Continue with Google</span>
            <span className="block text-xs text-ink-muted">Save your players &amp; stats</span>
          </span>
        </button>

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
        </div>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
