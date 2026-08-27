// "Online now" is handled by the caller (it's presence state, not a time
// computation) — this only ever renders a past timestamp.
export function formatLastSeen(value: string | Date | null): string {
  if (!value) return "Never online";

  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
