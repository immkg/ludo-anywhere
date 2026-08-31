export type RoomStatus = "lobby" | "playing" | "finished";

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
