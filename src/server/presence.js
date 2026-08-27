// In-memory, per-process presence — mirrors the style of rooms.js. Never
// persisted beyond User.lastSeenAt (written by server.js on last-socket
// disconnect); "online now" only ever means "has a live socket right now",
// so it can't survive a server restart and shouldn't try to.

const onlineSockets = new Map(); // userId -> Set<socketId>
const userRoom = new Map(); // userId -> roomCode (their current *lobby* room, if any)

// Returns true if this was the user's first socket (an offline -> online transition).
export function markOnline(userId, socketId) {
  const existing = onlineSockets.get(userId);
  if (existing) {
    existing.add(socketId);
    return false;
  }
  onlineSockets.set(userId, new Set([socketId]));
  return true;
}

// Returns true if this was the user's last socket (an online -> offline transition).
export function markOffline(userId, socketId) {
  const existing = onlineSockets.get(userId);
  if (!existing) return false;
  existing.delete(socketId);
  if (existing.size > 0) return false;
  onlineSockets.delete(userId);
  userRoom.delete(userId);
  return true;
}

export function isOnline(userId) {
  return onlineSockets.has(userId);
}

export function setUserRoom(userId, roomCode) {
  userRoom.set(userId, roomCode);
}

// Only clears if the user's tracked room still matches — a stale clear from
// an old room shouldn't wipe out a newer one they've since joined.
export function clearUserRoom(userId, roomCode) {
  if (userRoom.get(userId) === roomCode) userRoom.delete(userId);
}

export function getUserRoom(userId) {
  return userRoom.get(userId) ?? null;
}
