"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };

export default function FilterDropdown({
  icon,
  value,
  options,
  onChange,
  ariaLabel,
}: {
  icon?: ReactNode;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-ink transition hover:bg-surface-2"
      >
        {icon}
        <span className="truncate">{selected?.label}</span>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          className={cn("h-4 w-4 shrink-0 text-ink-muted transition-transform", open && "rotate-180")}
        >
          <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            // Left-anchored (grows rightward from the trigger) rather than
            // right-anchored: both call sites (HistoryFilterBar,
            // LeaderboardFilterBar) cluster their dropdowns together near
            // the left edge of a header that stacks to its own row on
            // mobile — right-anchoring the first one there pushed this
            // min-w-[10rem] menu left of the trigger and off-screen.
            className="absolute left-0 z-20 mt-2 max-h-64 min-w-[10rem] overflow-auto rounded-2xl border border-line bg-surface p-1 shadow-lg"
          >
            {options.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between truncate rounded-xl px-3 py-2 text-left text-sm font-medium transition",
                    o.value === value ? "bg-accent/10 text-accent" : "text-ink hover:bg-surface-2"
                  )}
                >
                  {o.label}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
