import Link from "next/link";
import type { ReactNode } from "react";
import AppIconMark from "@/components/brand/AppIconMark";
import Wordmark from "@/components/brand/Wordmark";
import MarketingFooter from "@/components/marketing/MarketingFooter";

// Shared shell for the static informational pages (/about, /faq, /ludo-rules,
// etc.) — deliberately not AuthenticatedNav/GuestNav, which are the app's
// sidebar chrome for signed-in-style pages. These are plain content pages
// for crawlers and readers, so they get a simple header + footer instead.
export default function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center px-4 pt-6 sm:px-6 sm:pt-8 lg:px-10 lg:pt-10">
        <Link href="/" className="flex items-center gap-2">
          <AppIconMark className="h-7 w-7" />
          <Wordmark className="text-xl" />
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:gap-7 sm:px-6 lg:px-10">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
