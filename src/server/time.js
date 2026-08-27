const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // no DST

// The free tier resets on a fixed India calendar day, not a per-user
// timezone or a stored counter — "today" is derived from UTC at query
// time by shifting into IST, truncating to the date, and shifting back.
export function istDayBoundsUtc(date = new Date()) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  const istMidnight = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  const start = new Date(istMidnight - IST_OFFSET_MS);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}
