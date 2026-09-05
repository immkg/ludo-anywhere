import Redis from "ioredis";

// Room/game state persistence (see roomStore.js) is optional: with no
// REDIS_URL set (e.g. local dev that hasn't opted in), getRedisClient
// returns null and every roomStore function becomes a no-op — the app
// falls back to today's in-memory-only behavior, unchanged. Production
// always sets REDIS_URL (see .env.example).
let client = null;
let loggedMissingUrl = false;

export function getRedisClient() {
  if (client) return client;
  const url = process.env.REDIS_URL;
  if (!url) {
    if (!loggedMissingUrl) {
      console.warn("REDIS_URL not set — room/game state will not survive a server restart");
      loggedMissingUrl = true;
    }
    return null;
  }

  client = new Redis(url, {
    // Fail a command quickly instead of queuing it indefinitely while
    // Redis is unreachable — a stalled room-state write should never pile
    // up an unbounded backlog (persistRoom in server.js is already
    // fire-and-forget, but this keeps a Redis outage from making that
    // backlog grow forever).
    maxRetriesPerRequest: 3,
    retryStrategy: (attempt) => Math.min(attempt * 500, 5000),
  });
  client.on("error", (err) => console.error("Redis client error", err));
  client.on("connect", () => console.log("Redis connected"));
  return client;
}
