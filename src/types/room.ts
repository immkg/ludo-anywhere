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
};

export type Room = {
  code: string;
  maxPlayers: number;
  hostSeatId: string | null;
  status: RoomStatus;
  sponsored: boolean;
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
