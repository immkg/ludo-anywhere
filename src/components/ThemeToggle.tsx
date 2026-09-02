"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { useTheme, type ThemeMode } from "@/components/ThemeProvider";

const THEME_OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: "light", label: "Light" },
  { mode: "dark", label: "Dark" },
  { mode: "auto", label: "Auto" },
];

export default function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  // ThemeProvider seeds `theme` from localStorage on the client but the
  // server always renders "light" (no access to localStorage), so using
  // `theme` directly on first render mismatches SSR output. Stay on the
  // SSR-safe default until after mount, then switch to the real value —
  // this moves the change to a post-hydration render instead of a
  // hydration diff.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const activeTheme = mounted ? theme : "light";

  return (
    <div className={clsx("flex gap-1 rounded-full border border-line p-1", className)}>
      {THEME_OPTIONS.map(({ mode, label }) => (
        <button
          key={mode}
          onClick={() => setTheme(mode)}
          aria-pressed={activeTheme === mode}
          className={clsx(
            "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
            activeTheme === mode ? "bg-accent text-white" : "text-ink-muted"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
