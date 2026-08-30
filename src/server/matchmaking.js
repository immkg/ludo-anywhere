// In-memory matchmaking pool (mirrors the style of rooms.js/presence.js —
// single-process, no Redis). One shared queue, always targeting a 4-seat
// room: with a small user base, splitting by player count would just make
// matches slower to find. Whoever ends up in the lobby can start early for
// a smaller game (see WaitingRoom's existing Start button).
const MATCHMAKING_SIZE = 4;
const openRooms = new Set();

// `getRoom` is passed in (rather than imported) to avoid a circular import
// with rooms.js.
export function findOpenMatchRoom(getRoom) {
  for (const code of openRooms) {
    const room = getRoom(code);
    if (room && room.status === "lobby" && room.seats.length < room.maxPlayers) return room;
    openRooms.delete(code); // stale: full, started, or gone — prune opportunistically
  }
  return null;
}

export function markOpen(code) {
  openRooms.add(code);
}

export function markClosed(code) {
  openRooms.delete(code);
}

export { MATCHMAKING_SIZE };
