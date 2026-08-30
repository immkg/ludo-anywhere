"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import FilterDropdown from "@/components/ui/FilterDropdown";
import { IconPerson } from "@/components/home/icons";
import { RANGE_OPTIONS, SCOPE_OPTIONS } from "./leaderboardFilterOptions";

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 text-ink-muted">
      <rect x="3" y="4.5" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 8h14M7 3v3M13 3v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function LeaderboardFilterBar({
  range,
  scope,
  showScopeFilter = true,
}: {
  range: string;
  scope: string;
  showScopeFilter?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const update = (key: "range" | "scope", nextValue: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextValue === "all") params.delete(key);
    else params.set(key, nextValue);
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
      {showScopeFilter && (
        <FilterDropdown
          ariaLabel="Filter by player scope"
          icon={<IconPerson className="h-4 w-4 text-ink-muted" />}
          value={scope}
          options={SCOPE_OPTIONS}
          onChange={(v) => update("scope", v)}
        />
      )}
    </div>
  );
}
