"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type PillButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  color?: string;
  tone?: "outline" | "solid" | "neutral";
  icon?: ReactNode;
};

// One shared shape for every small colored per-row action on the Friends
// page (Play, Invite, Accept, Decline, Add friend, Copy link, WhatsApp) —
// same 44px pill, just a different hue and fill per action, so the color
// language stays consistent instead of near-duplicate button styles
// drifting apart across FriendRow/FriendSearch/FriendRequests/InviteLinkCard.
export default function PillButton({
  color,
  tone = "outline",
  icon,
  className,
  children,
  style,
  ...props
}: PillButtonProps) {
  const toneStyle =
    tone === "solid" ? { background: color, color: "#fff" } : tone === "outline" ? { borderColor: color, color } : undefined;

  return (
    <button
      className={cn(
        "flex min-h-11 items-center justify-center gap-1.5 rounded-full px-3.5 text-xs font-bold transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none",
        tone === "neutral" ? "border border-line text-ink-muted" : "border bg-surface",
        className
      )}
      style={{ ...toneStyle, ...style }}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
