"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-accent text-white shadow-lg shadow-accent/30 active:scale-[0.98]",
  secondary: "bg-surface-2 text-ink border border-line active:scale-[0.98]",
  ghost: "bg-transparent text-ink-muted hover:text-ink",
};

export default function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "min-h-12 px-5 rounded-2xl font-semibold text-base transition disabled:opacity-40 disabled:pointer-events-none",
        VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    />
  );
}
