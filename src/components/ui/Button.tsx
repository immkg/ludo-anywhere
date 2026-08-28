"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  icon?: ReactNode;
  subtitle?: ReactNode;
};

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-accent text-white shadow-lg shadow-accent/30 active:scale-[0.98]",
  secondary: "bg-surface-2 text-ink border border-line active:scale-[0.98]",
  ghost: "bg-transparent text-ink-muted hover:text-ink",
};

export default function Button({
  variant = "primary",
  icon,
  subtitle,
  className,
  children,
  ...props
}: ButtonProps) {
  const stacked = Boolean(icon || subtitle);

  return (
    <button
      className={cn(
        "rounded-2xl font-semibold transition disabled:opacity-40 disabled:pointer-events-none",
        stacked
          ? "flex min-h-16 items-center justify-center gap-3 px-4 py-2 text-left"
          : "min-h-12 px-5 text-base",
        VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    >
      {stacked ? (
        <>
          {icon && <span className="flex h-9 w-9 shrink-0 items-center justify-center">{icon}</span>}
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-base font-bold">{children}</span>
            {subtitle && (
              <span
                className={cn(
                  "truncate text-xs font-normal",
                  variant === "primary" ? "text-white/80" : "text-ink-muted"
                )}
              >
                {subtitle}
              </span>
            )}
          </span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
