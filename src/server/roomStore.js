import { getRedisClient } from "./redis.js";
import { toPersistedRoom } from "./rooms.js";

const ROOM_KEY_PREFIX = "ludo:room:";
// Generous safety net, not the real cleanup mechanism — server.js's
// persistRoom already deletes a room's Redis mirror the moment it empties
// out, the same instant it would've been dropped from the in-memory map.
// This just guarantees a room that somehow never gets that explicit delete
// (e.g. the process died between being created and its first broadcast)
// doesn't sit in Redis forever.
const ROOM_TTL_SECONDS = 24 * 60 * 60;

function roomKey(code) {
  return `${ROOM_KEY_PREFIX}${code}`;
}

export async function saveRoomState(room) {
  const redis = getRedisClient();
  if (!redis) return;
  await redis.set(roomKey(room.code), JSON.stringify(toPersistedRoom(room)), "EX", ROOM_TTL_SECONDS);
}

export async function deleteRoomState(code) {
  const redis = getRedisClient();
  if (!redis) return;
  await redis.del(roomKey(code));
}

// Scans (never KEYS, which blocks Redis while it walks the whole keyspace)
// every persisted room at boot so server.js can rebuild the in-memory
// `rooms` map before accepting connections — see restoreRoom in rooms.js.
export async function loadAllRoomStates() {
  const redis = getRedisClient();
  if (!redis) return [];

  const states = [];
  let cursor = "0";
  do {
    const [nextCursor, keys] = await redis.scan(cursor, "MATCH", `${ROOM_KEY_PREFIX}*`, "COUNT", 100);
    cursor = nextCursor;
    if (keys.length > 0) {
      const values = await redis.mget(keys);
      for (const value of values) {
        if (!value) continue;
        try {
          states.push(JSON.parse(value));
        } catch (err) {
          console.error("Failed to parse persisted room state", err);
        }
      }
    }
  } while (cursor !== "0");
  return states;
}
