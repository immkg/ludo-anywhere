// Deterministic per-seat animal avatar, so each player gets a stable emoji
// (based on their seat id) instead of a random one that changes on re-render.
const ANIMALS = [
  "🐵", "🐶", "🦊", "🐱", "🦁", "🐯", "🐴", "🦄",
  "🐮", "🐷", "🐭", "🐹", "🐰", "🐻", "🐼", "🐨",
  "🐸", "🐧", "🐦", "🦉", "🦅", "🐺", "🐗", "🦓",
  "🐢", "🐙", "🦋", "🐳", "🦒", "🦘", "🦔", "🐿️",
];

export function animalForSeat(seatId: string): string {
  let hash = 0;
  for (let i = 0; i < seatId.length; i++) {
    hash = (hash * 31 + seatId.charCodeAt(i)) | 0;
  }
  return ANIMALS[Math.abs(hash) % ANIMALS.length];
}
