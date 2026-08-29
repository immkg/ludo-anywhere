"use client";

import clsx from "clsx";
import { useTheme, type ThemeMode } from "@/components/ThemeProvider";

const THEME_OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: "light", label: "Light" },
  { mode: "dark", label: "Dark" },
  { mode: "auto", label: "Auto" },
];

export default function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className={clsx("flex gap-1 rounded-full border border-line p-1", className)}>
      {THEME_OPTIONS.map(({ mode, label }) => (
        <button
          key={mode}
          onClick={() => setTheme(mode)}
          aria-pressed={theme === mode}
          className={clsx(
            "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
            theme === mode ? "bg-accent text-white" : "text-ink-muted"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
