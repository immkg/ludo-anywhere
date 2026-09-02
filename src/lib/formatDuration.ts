// A short "how long has this been going" label for a live match card —
// deliberately coarser than WaitingRoom's mm:ss lobby-wait stopwatch
// (src/components/lobby/WaitingRoom.tsx), since these games run much
// longer and a viewer only needs a rough sense of elapsed time.
export function formatElapsedShort(elapsedMs: number): string {
  const totalMinutes = Math.max(0, Math.floor(elapsedMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}
