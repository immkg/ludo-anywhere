"use client";

import { cn } from "@/lib/utils";

type NumberPickerProps = {
  options: number[];
  value: number;
  onChange: (n: number) => void;
};

export default function NumberPicker({ options, value, onChange }: NumberPickerProps) {
  return (
    <div className="mt-2 flex gap-2">
      {options.map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={cn(
            "h-11 flex-1 rounded-xl border font-semibold",
            value === n ? "border-accent bg-accent text-white" : "border-line bg-surface"
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
