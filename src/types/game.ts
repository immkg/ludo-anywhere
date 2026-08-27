export type GameSeat = {
  id: string;
  armIndex: number;
  tokens: number[]; // -1 = yard, ring cells, then home column, ending at "finished"
  finished: boolean;
  // Paused by the host — skipped in turn order, tokens stay put and stay
  // capturable. Distinct from `finished`: a suspended seat can resume and
  // keep playing normally (see suspendSeat/resumeSeat in engine.js).
  suspended: boolean;
};

export type GameStatus = "playing" | "finished";

export type GameState = {
  seats: GameSeat[];
  currentSeatIndex: number;
  diceValue: number | null;
  // The most recent number rolled, kept even after diceValue is cleared
  // (e.g. an auto-forfeited turn) so clients can animate the dice landing
  // on the real result.
  lastRoll: number | null;
  // Increments on every roll, even ones that leave diceValue/lastRoll
  // looking unchanged (e.g. rolling the same number twice in a row) — the
  // unambiguous "a new roll just happened" signal for the dice animation.
  rollSeq: number;
  consecutiveSixes: number;
  status: GameStatus;
  winnerSeatId: string | null;
  // Ordered seatIds as they finish (1st place first) — play continues
  // past the first finish; see placementFor in src/game/engine.js.
  placements: string[];
};
