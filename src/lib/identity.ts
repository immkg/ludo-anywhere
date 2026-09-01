import type { OwnedSeat, OwnedSpectator } from "@/types/room";

const DEVICE_ID_KEY = "ludo:deviceId";
const GUEST_NAME_KEY = "ludo:guestName";
const seatsKey = (roomCode: string) => `ludo:seats:${roomCode.toUpperCase()}`;
const spectatorKey = (roomCode: string) => `ludo:spectator:${roomCode.toUpperCase()}`;

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

// A guest's chosen display name, remembered per-device so it doesn't need
// retyping on the next room they join (see server.js's room:join, which
// identifies a signed-out joiner by deviceId rather than a real account).
export function getGuestName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(GUEST_NAME_KEY) ?? "";
}

export function saveGuestName(name: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(GUEST_NAME_KEY, name);
}

const FUNNY_ADJECTIVES = [
  "Sneaky",
  "Dizzy",
  "Bouncy",
  "Sleepy",
  "Grumpy",
  "Wobbly",
  "Speedy",
  "Fluffy",
  "Mighty",
  "Silly",
  "Clever",
  "Jolly",
  "Zesty",
  "Turbo",
  "Ninja",
];
const FUNNY_NOUNS = [
  "Panda",
  "Penguin",
  "Llama",
  "Tiger",
  "Koala",
  "Otter",
  "Dragon",
  "Unicorn",
  "Raccoon",
  "Walrus",
  "Falcon",
  "Hamster",
  "Yeti",
  "Pawn",
];

// A lighthearted placeholder for the guest-name field, and the fallback
// name (prefixed "Guest " by the caller) if someone doesn't bother typing
// one — friendlier than a hard "enter your name" error for a flow whose
// whole point is zero friction.
export function randomFunnyName(): string {
  const adjective = FUNNY_ADJECTIVES[Math.floor(Math.random() * FUNNY_ADJECTIVES.length)];
  const noun = FUNNY_NOUNS[Math.floor(Math.random() * FUNNY_NOUNS.length)];
  return `${adjective} ${noun}`;
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

// Same idea as saveOwnedSeats/loadOwnedSeats, but a single spectator slot
// per room per device rather than a list — a device only ever watches one
// room as one spectator at a time (see room:watch in server.js).
export function saveSpectatorToken(roomCode: string, spectator: OwnedSpectator) {
  if (typeof window === "undefined") return;
  localStorage.setItem(spectatorKey(roomCode), JSON.stringify(spectator));
}

export function loadSpectatorToken(roomCode: string): OwnedSpectator | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(spectatorKey(roomCode));
    return raw ? (JSON.parse(raw) as OwnedSpectator) : null;
  } catch {
    return null;
  }
}

export function clearSpectatorToken(roomCode: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(spectatorKey(roomCode));
}
