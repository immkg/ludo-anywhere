"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export default function NavigationItem({
  href,
  label,
  icon,
  color,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  color: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
        active ? "bg-surface-2" : "hover:bg-surface-2/60"
      )}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full [&>svg]:h-4 [&>svg]:w-4"
        style={active ? { backgroundColor: color, color: "#fff" } : { backgroundColor: `${colorMix(color)}`, color }}
      >
        {icon}
      </span>
      <span className={cn("min-w-0 flex-1 truncate text-ink", active ? "font-extrabold" : "font-semibold")}>{label}</span>
    </Link>
  );
}

// `${color}1a` (~10% alpha hex suffix) only works cleanly for 6-digit hex
// values — GOLD (navItems.tsx) is a CSS var, not hex, so it needs
// color-mix() instead to get the same tinted-circle look.
function colorMix(color: string): string {
  if (color.startsWith("#")) return `${color}1a`;
  return `color-mix(in srgb, ${color} 15%, transparent)`;
}
