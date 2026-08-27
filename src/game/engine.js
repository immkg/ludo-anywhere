import {
  TOKENS_PER_SEAT,
  YARD,
  trackSteps,
  finished,
  relativeToGlobalRing,
  isSafeRelativeCell,
} from "./board.js";

// seats: [{ id, armIndex }] — display info (name/color/connection) lives in
// the room, not the game state.
export function createGame(seats) {
  return {
    seats: seats.map((s) => ({
      id: s.id,
      armIndex: s.armIndex,
      tokens: Array(TOKENS_PER_SEAT).fill(YARD),
      finished: false,
    })),
    currentSeatIndex: 0,
    diceValue: null,
    lastRoll: null,
    rollSeq: 0,
    consecutiveSixes: 0,
    status: "playing",
    winnerSeatId: null,
  };
}

export function getCurrentSeat(state) {
  return state.seats[state.currentSeatIndex];
}

// Which of a seat's tokens can legally move given the current dice value.
export function getValidMoves(state, seatId) {
  const seat = getCurrentSeat(state);
  if (!seat || seat.id !== seatId) return [];
  if (state.status !== "playing" || state.diceValue == null) return [];

  const dice = state.diceValue;
  const finishLine = finished();
  const moves = [];
  seat.tokens.forEach((pos, tokenIndex) => {
    if (pos === YARD) {
      if (dice === 6) moves.push(tokenIndex);
      return;
    }
    if (pos + dice <= finishLine) moves.push(tokenIndex);
  });
  return moves;
}

// Chooses which legal token to auto-move when the player doesn't act in
// time: a move that captures an opponent wins outright, then a move that
// lands on a safe cell, then (among what's left) the token that ends up
// furthest along its track — i.e. closest to home. Ties are broken at
// random rather than always favoring the same token index.
export function pickAutoMoveToken(state, seatId) {
  const seat = getCurrentSeat(state);
  if (!seat || seat.id !== seatId) return null;

  const legal = getValidMoves(state, seatId);
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0];

  const dice = state.diceValue;
  const track = trackSteps();

  const candidates = legal.map((tokenIndex) => {
    const from = seat.tokens[tokenIndex];
    const to = from === YARD ? 0 : from + dice;
    const onRing = to < track;
    const safe = !onRing || isSafeRelativeCell(seat.armIndex, to);
    const captures = onRing && !safe && wouldCapture(state, seat, to);
    return { tokenIndex, to, captures, safe };
  });

  const pickFurthest = (pool) => {
    const maxTo = Math.max(...pool.map((c) => c.to));
    const furthest = pool.filter((c) => c.to === maxTo);
    return furthest[Math.floor(Math.random() * furthest.length)].tokenIndex;
  };

  const capturing = candidates.filter((c) => c.captures);
  if (capturing.length > 0) return pickFurthest(capturing);

  const safe = candidates.filter((c) => c.safe);
  if (safe.length > 0) return pickFurthest(safe);

  return pickFurthest(candidates);
}

function wouldCapture(state, seat, to) {
  const track = trackSteps();
  const targetGlobal = relativeToGlobalRing(seat.armIndex, to);
  return state.seats.some((other) => {
    if (other.id === seat.id) return false;
    return other.tokens.some((pos) => {
      if (pos === YARD || pos >= track) return false;
      return relativeToGlobalRing(other.armIndex, pos) === targetGlobal;
    });
  });
}

function advanceSeatIndex(state) {
  const n = state.seats.length;
  for (let step = 1; step <= n; step++) {
    const candidate = (state.currentSeatIndex + step) % n;
    if (!state.seats[candidate].finished) return candidate;
  }
  return state.currentSeatIndex;
}

function endTurn(state) {
  return {
    ...state,
    currentSeatIndex: advanceSeatIndex(state),
    diceValue: null,
    consecutiveSixes: 0,
  };
}

// Rolls the dice for the current seat. If the roll leaves no legal move
// (nothing off the yard and nothing on the board), or the seat has now
// rolled three sixes in a row, the turn is auto-forfeited and passed on. If
// exactly one token can legally move, that move is played automatically
// rather than waiting on a tap that has only one possible answer.
export function rollDice(state) {
  if (state.status !== "playing" || state.diceValue != null) return state;

  const dice = Math.floor(Math.random() * 6) + 1;
  const consecutiveSixes = dice === 6 ? state.consecutiveSixes + 1 : 0;

  const rollSeq = state.rollSeq + 1;

  if (consecutiveSixes >= 3) {
    return endTurn({ ...state, diceValue: dice, lastRoll: dice, rollSeq, consecutiveSixes });
  }

  const rolled = { ...state, diceValue: dice, lastRoll: dice, rollSeq, consecutiveSixes };
  const seat = getCurrentSeat(rolled);
  const moves = getValidMoves(rolled, seat.id);
  if (moves.length === 0) return endTurn(rolled);
  if (moves.length === 1) return moveToken(rolled, seat.id, moves[0]);
  return rolled;
}

export function moveToken(state, seatId, tokenIndex) {
  if (state.status !== "playing" || state.diceValue == null) return state;

  const seatIndex = state.currentSeatIndex;
  const seat = state.seats[seatIndex];
  if (!seat || seat.id !== seatId) return state;

  const legal = getValidMoves(state, seatId);
  if (!legal.includes(tokenIndex)) return state;

  const track = trackSteps();
  const finishLine = finished();

  const dice = state.diceValue;
  const from = seat.tokens[tokenIndex];
  const to = from === YARD ? 0 : from + dice;

  const tokens = [...seat.tokens];
  tokens[tokenIndex] = to;

  const seats = [...state.seats];
  seats[seatIndex] = { ...seat, tokens };

  let captured = false;
  if (to < track && !isSafeRelativeCell(seat.armIndex, to)) {
    const targetGlobal = relativeToGlobalRing(seat.armIndex, to);
    seats.forEach((other, otherIndex) => {
      if (otherIndex === seatIndex) return;
      const otherTokens = other.tokens.map((pos) => {
        if (pos === YARD || pos >= track) return pos;
        if (relativeToGlobalRing(other.armIndex, pos) === targetGlobal) {
          captured = true;
          return YARD;
        }
        return pos;
      });
      seats[otherIndex] = { ...other, tokens: otherTokens };
    });
  }

  const seatFinished = tokens.every((pos) => pos === finishLine);
  if (seatFinished) seats[seatIndex] = { ...seats[seatIndex], finished: true };

  // consecutiveSixes is only cleared when a turn actually ends (endTurn) or
  // a non-six is rolled (in rollDice) — a bonus move after a six must not
  // erase the count, or three-sixes-forfeit could never trigger.
  let next = { ...state, seats, diceValue: null };

  if (seatFinished) {
    return { ...next, status: "finished", winnerSeatId: seatId, consecutiveSixes: 0 };
  }

  const bonusTurn = dice === 6 || captured || to === finishLine;
  return bonusTurn ? next : endTurn(next);
}
