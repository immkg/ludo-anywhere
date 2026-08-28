"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import FilterDropdown from "./FilterDropdown";
import { IconPerson } from "@/components/home/icons";
import { RANGE_OPTIONS } from "./historyFilterOptions";

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 text-ink-muted">
      <rect x="3" y="4.5" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 8h14M7 3v3M13 3v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function HistoryFilterBar({
  players,
  range,
  player,
}: {
  players: { id: string; name: string }[];
  range: string;
  player: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const playerOptions = [
    { value: "all", label: "All players" },
    ...players.map((p) => ({ value: p.id, label: p.name })),
  ];

  const update = (key: "range" | "player", nextValue: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextValue === "all") params.delete(key);
    else params.set(key, nextValue);
    params.delete("limit");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterDropdown
        ariaLabel="Filter by date range"
        icon={<CalendarIcon />}
        value={range}
        options={RANGE_OPTIONS}
        onChange={(v) => update("range", v)}
      />
      <FilterDropdown
        ariaLabel="Filter by player"
        icon={<IconPerson className="h-4 w-4 text-ink-muted" />}
        value={player}
        options={playerOptions}
        onChange={(v) => update("player", v)}
      />
    </div>
  );
}
