"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { noteSession, noteRouteVisited, notePricingLeft } from "@/lib/splashTriggers";

// Feeds the flash-discount splash's trigger signals (see
// src/lib/splashTriggers.ts) — mounted app-wide in src/app/layout.tsx,
// same as PosthogProvider, so it sees both guest and signed-in traffic.
// Renders nothing.
export default function RouteTracker() {
  const pathname = usePathname();
  const prevPathname = useRef<string | null>(null);

  useEffect(() => {
    noteSession();
  }, []);

  useEffect(() => {
    if (prevPathname.current === "/pricing" && pathname !== "/pricing") {
      notePricingLeft();
    }
    noteRouteVisited(pathname);
    prevPathname.current = pathname;
  }, [pathname]);

  return null;
}
