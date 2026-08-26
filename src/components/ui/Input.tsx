"use client";

import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export default function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-12 w-full rounded-2xl border border-line bg-surface-2 px-4 text-base text-ink placeholder:text-ink-muted",
        "focus:outline-none focus:ring-2 focus:ring-accent",
        className
      )}
      {...props}
    />
  );
}
