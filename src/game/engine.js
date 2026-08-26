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
// rolled three sixes in a row, the turn is auto-forfeited and passed on.
export function rollDice(state) {
  if (state.status !== "playing" || state.diceValue != null) return state;

  const dice = Math.floor(Math.random() * 6) + 1;
  const consecutiveSixes = dice === 6 ? state.consecutiveSixes + 1 : 0;

  if (consecutiveSixes >= 3) {
    return endTurn({ ...state, diceValue: dice, consecutiveSixes });
  }

  const rolled = { ...state, diceValue: dice, consecutiveSixes };
  const seat = getCurrentSeat(rolled);
  const hasMove = getValidMoves(rolled, seat.id).length > 0;
  return hasMove ? rolled : endTurn(rolled);
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
