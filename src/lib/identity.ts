import type { OwnedSeat } from "@/types/room";

const DEVICE_ID_KEY = "ludo:deviceId";
const seatsKey = (roomCode: string) => `ludo:seats:${roomCode.toUpperCase()}`;

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function saveOwnedSeats(roomCode: string, seats: OwnedSeat[]) {
  if (typeof window === "undefined") return;
  const existing = loadOwnedSeats(roomCode);
  const merged = [...existing.filter((s) => !seats.some((n) => n.id === s.id)), ...seats];
  localStorage.setItem(seatsKey(roomCode), JSON.stringify(merged));
}

export function loadOwnedSeats(roomCode: string): OwnedSeat[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(seatsKey(roomCode));
    return raw ? (JSON.parse(raw) as OwnedSeat[]) : [];
  } catch {
    return [];
  }
}

export function clearOwnedSeats(roomCode: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(seatsKey(roomCode));
}
