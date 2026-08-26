export type RoomStatus = "lobby" | "playing" | "finished";

export type Seat = {
  id: string;
  name: string;
  armIndex: number;
  deviceId: string;
  connected: boolean;
};

export type Room = {
  code: string;
  maxPlayers: number;
  hostSeatId: string | null;
  status: RoomStatus;
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
