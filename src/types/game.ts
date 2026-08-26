export type GameSeat = {
  id: string;
  armIndex: number;
  tokens: number[]; // -1 = yard, ring cells, then home column, ending at "finished"
  finished: boolean;
};

export type GameStatus = "playing" | "finished";

export type GameState = {
  arms: number; // board shape: 4 (classic), 5 (pentagon), or 6 (hexagon)
  seats: GameSeat[];
  currentSeatIndex: number;
  diceValue: number | null;
  consecutiveSixes: number;
  status: GameStatus;
  winnerSeatId: string | null;
};
