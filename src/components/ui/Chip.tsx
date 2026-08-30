import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type ChipProps = {
  icon?: ReactNode;
  label: ReactNode;
  subtitle?: ReactNode;
  onClick?: () => void;
  className?: string;
};

export default function Chip({ icon, label, subtitle, onClick, className }: ChipProps) {
  const Tag = onClick ? "button" : "div";
  const interactive = Boolean(onClick);

  if (subtitle) {
    return (
      <Tag
        onClick={onClick}
        className={cn(
          "flex flex-col items-center gap-1 rounded-2xl px-2 py-3 text-center",
          interactive ? "border border-line bg-surface-2" : "bg-transparent",
          className
        )}
      >
        {icon && <span className="h-6 w-6">{icon}</span>}
        <span className="text-xs font-semibold text-ink">{label}</span>
        <span className="text-[11px] text-ink-muted">{subtitle}</span>
      </Tag>
    );
  }

  return (
    <Tag
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-ink",
        interactive ? "border border-line bg-surface" : "bg-transparent",
        className
      )}
    >
      {icon && <span className="h-4 w-4">{icon}</span>}
      {label}
    </Tag>
  );
}
