export type RoomStatus = "lobby" | "playing" | "finished";

// "private" (default): the host approves each watcher and their identity
// never reaches other clients — only the host briefly sees a name at
// approval time (see IncomingJoinRequests.tsx). "public": anyone with the
// room's link can watch immediately, and everyone sees a live count (see
// Room.spectatorCount) — but still never individual watchers' names.
export type SpectatePolicy = "private" | "public";

// A mid-game seat with no seat object left at all — its game.seats entry
// survives (finished, unplaced) but it dropped out of room.seats via the
// server's disconnect-grace-period prune. The host can still fill it with a
// bot (see room:addBot in server.js) even though there's no normal seat row
// anywhere in `Room.seats` to show/manage it.
export type VacatedSeat = { id: string; armIndex: number };

export type Seat = {
  id: string;
  name: string;
  armIndex: number;
  deviceId: string;
  connected: boolean;
  profileId: string | null;
  // Host-added filler seat (see room:fillBots) — never has a real
  // deviceId/profileId/userId behind it, and plays itself server-side
  // (see scheduleBotTurn in server.js).
  bot?: boolean;
  // A `bot` seat added automatically by matchmaking (see
  // scheduleMatchmakingBotFill in server.js) rather than an explicit host
  // "Fill with Bot" action — UI shows it exactly like a real player (no
  // robot icon/"Bot" label), see PlayerSeatCard/PlayerCorner.
  simulated?: boolean;
};

export type Room = {
  code: string;
  maxPlayers: number;
  hostSeatId: string | null;
  status: RoomStatus;
  sponsored: boolean;
  // True for a room matched via "Find Player Online" rather than created
  // directly — see matchmaking:join in server.js.
  matchmaking: boolean;
  spectatePolicy: SpectatePolicy;
  spectatorCount: number;
  vacatedSeats: VacatedSeat[];
  seats: Seat[];
};

// What the server hands back for each seat this device just created/joined —
// the `token` lets this device reclaim the seat after a refresh/reconnect.
export type OwnedSeat = {
  id: string;
  token: string;
  armIndex: number;
  name: string;
};

// Same idea as OwnedSeat, but for a spectator — no armIndex/name to
// remember since a watcher isn't seated on the board (see room:watch in
// server.js).
export type OwnedSpectator = {
  id: string;
  token: string;
};

// One row of the home dashboard's "Live Matches" list (see
// listLiveMatches in src/server/rooms.js / GET /api/live-matches) — a
// trimmed, read-only view of an in-progress, publicly-spectatable room.
// Deliberately not `Room`: no seat-level detail, since every action here
// (join/spectate) deep-links into /join or /room, which fetch the real
// Room themselves.
// "matchmaking": auto-paired via Find Players Online. "guest": the
// no-sign-in-needed Play with Bots flow. "private": a signed-in host's own
// created room. See listLiveMatches in src/server/rooms.js.
export type LiveMatchRoomType = "matchmaking" | "guest" | "private";

export type LiveMatchSummary = {
  code: string;
  roomType: LiveMatchRoomType;
  maxPlayers: number;
  humanCount: number;
  botCount: number;
  spectatorCount: number;
  elapsedMs: number;
  // Name of whoever's furthest along right now, or null before anyone's
  // left the yard or on a tie (see leadingSeatName in rooms.js) — never a
  // guess at who's "really" ahead.
  leaderName: string | null;
};

// One message on the spectator-only chat side channel (see
// spectator:chat:send/spectator:chat:message in server.js) — deliberately
// separate from the player-facing quick-chat/reaction stream (game:reaction)
// so a spectator conversation never clutters players' view. Free text
// (unlike the player-facing preset phrases), capped server-side at
// SPECTATOR_CHAT_MAX_LENGTH (src/server/rooms.js) — spectators are a much
// smaller, lower-risk audience than the full player base.
export type SpectatorChatMessage = {
  id: string;
  fromId: string;
  fromName: string;
  text: string;
  ts: number;
};
