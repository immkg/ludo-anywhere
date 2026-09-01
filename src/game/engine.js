import {
  TOKENS_PER_SEAT,
  YARD,
  trackSteps,
  finished,
  relativeToGlobalRing,
  isSafeRelativeCell,
} from "./board.js";

// How long a client visually holds the die at the seat that just rolled
// before letting it hop to the next player's corner (see GameView.tsx's
// diceHoldArm) — a roll that also ends the turn (no legal move, three
// sixes, or a lone auto-played move) would otherwise unmount/remount the
// single shared <Dice/> before its spin ever plays. Shared here (rather
// than duplicated as a magic number in both GameView.tsx and server.js) so
// the server's bot scheduler can guarantee it never rolls again before this
// hold has released — otherwise the *next* bot's roll arrives mid-hold,
// forcing a remount right as it needs to animate, silently swallowing it.
export const DICE_HOLD_MS = 2000;

// [autoRollMs, autoMoveMs] per inactivity level — see resetInactivity/
// advanceInactivity below. A connected seat that lets the server auto-play
// its own turn (see server.js's sweepTurnTimeouts) advances one level for
// next time; any real roll/move it makes itself resets it back to 0.
// Floors at the last entry rather than decaying indefinitely.
export const INACTIVITY_TIMEOUTS_MS = [
  [10000, 15000],
  [8000, 12000],
  [6000, 9000],
  [5000, 6000],
];

export function timeoutsForLevel(level) {
  return INACTIVITY_TIMEOUTS_MS[Math.min(level ?? 0, INACTIVITY_TIMEOUTS_MS.length - 1)];
}

// seats: [{ id, armIndex }] — display info (name/color/connection) lives in
// the room, not the game state.
export function createGame(seats) {
  return {
    seats: seats.map((s) => ({
      id: s.id,
      armIndex: s.armIndex,
      tokens: Array(TOKENS_PER_SEAT).fill(YARD),
      finished: false,
      suspended: false,
      inactivityLevel: 0,
    })),
    currentSeatIndex: 0,
    diceValue: null,
    lastRoll: null,
    rollSeq: 0,
    consecutiveSixes: 0,
    status: "playing",
    winnerSeatId: null,
    endedEarly: false,
    // Ordered list of seatIds as they finish — 1st place first. Play
    // continues past the first finish; the game only truly ends once at
    // most one seat is left unfinished (see moveToken), so a 4-seat game
    // can produce up to 3 placements before the last remaining seat is
    // the implicit loser (see placementFor).
    placements: [],
  };
}

// 1-indexed finishing rank for a seat: its position in `placements`, or
// (once the game has ended naturally) state.seats.length for whichever seat
// never finished — the always-exactly-one loser. Returns null for an
// unfinished seat in a game that's still playing (no rank yet), and also
// for one that never finished in a game the host ended early (see
// endGame) — there's no real loser there, just an unresolved seat.
export function placementFor(state, seatId) {
  const rank = state.placements.indexOf(seatId);
  if (rank !== -1) return rank + 1;
  return state.status === "finished" && !state.endedEarly ? state.seats.length : null;
}

// How many seats a friend could actually be invited into right now:
// paused (suspended) or removed-and-never-won. Mirrors claimableSeats in
// src/server/rooms.js, but working purely off GameState (no Room needed)
// — every game seat has a corresponding room seat, so counting straight
// from `state.seats` gives the same answer. Used client-side (see
// GameView.tsx) to gate the in-game "invite a friend" action on there
// being an open seat to invite them into.
export function claimableSeatCount(state) {
  return state.seats.filter((s) => s.suspended || (s.finished && !state.placements.includes(s.id))).length;
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
    if (!state.seats[candidate].finished && !state.seats[candidate].suspended) return candidate;
  }
  return state.currentSeatIndex;
}

// A suspended seat is a pause, not a resolution: it blocks the round from
// ending (it might resume and still finish, or still be "the loser") the
// same way it blocks taking turns. The round is only truly over once at
// most one seat is left that's neither finished nor suspended, *and*
// nothing is currently suspended.
function isRoundOver(seats) {
  const active = seats.filter((s) => !s.finished && !s.suspended).length;
  const suspended = seats.some((s) => s.suspended);
  return active <= 1 && !suspended;
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
    const placements = [...state.placements, seatId];
    next = { ...next, placements };

    // Play continues past the first finish — the round only truly ends
    // once isRoundOver says so, at which point the one seat still neither
    // finished nor suspended is the implicit loser (see placementFor). A
    // finishing move never grants a bonus turn regardless of the roll:
    // there's nothing left for this seat to do, so play always passes on.
    if (isRoundOver(seats)) {
      return { ...next, status: "finished", winnerSeatId: placements[0], consecutiveSixes: 0 };
    }
    return endTurn(next);
  }

  const bonusTurn = dice === 6 || captured || to === finishLine;
  return bonusTurn ? next : endTurn(next);
}

// Host-triggered pause: the seat is skipped for turns but its tokens stay
// exactly where they are (and stay capturable) — a resolution, not an
// end-state, so it never affects placements/round-over on its own. If it
// was this seat's turn, play passes on immediately.
export function suspendSeat(state, seatId) {
  const seats = state.seats.map((s) => (s.id === seatId ? { ...s, suspended: true } : s));
  const next = { ...state, seats };
  return state.seats[state.currentSeatIndex]?.id === seatId ? endTurn(next) : next;
}

// Host-triggered removal: tokens are cleared back to the yard and the
// seat drops out of active play for good — unlike a suspension, there's
// nothing to resume. Reuses `finished` to get turn-skipping and
// round-over accounting for free (see advanceSeatIndex/isRoundOver), but
// deliberately never enters `placements`, so placementFor ranks a
// removed seat last along with anyone else who never finished. Callers
// are expected to have already refused to remove a seat that's already
// won (placementFor(state, seatId) === 1..3) — this function doesn't
// re-check that itself.
export function removeSeatFromGame(state, seatId) {
  const seats = state.seats.map((s) =>
    s.id === seatId ? { ...s, tokens: Array(TOKENS_PER_SEAT).fill(YARD), finished: true, suspended: false } : s
  );
  let next = { ...state, seats };

  if (isRoundOver(seats)) {
    return { ...next, status: "finished", winnerSeatId: state.placements[0] ?? null, consecutiveSixes: 0 };
  }
  return state.seats[state.currentSeatIndex]?.id === seatId ? endTurn(next) : next;
}

// How far one token has traveled: 0 while still in the yard, otherwise its
// relative position + 1 (so leaving the yard for cell 0 already counts as
// a step) — a simple monotonic 0..finished()+1 scale, not the actual
// number of squares still ahead.
function tokenProgress(pos) {
  return pos === YARD ? 0 : pos + 1;
}

// A seat's overall "how far along" measure for the ranking below — the sum
// across all its tokens, so a seat with several tokens moving is ranked
// above one with a single token lucky enough to be furthest along but the
// rest still stuck in the yard.
function seatProgress(seat) {
  return seat.tokens.reduce((sum, pos) => sum + tokenProgress(pos), 0);
}

// Host-triggered early end. Two shapes, chosen by the caller (see
// room:endGame in server.js, which only sets `declareWinner` once the game
// has run long enough — a moves-and-duration threshold, not decided here):
//
// - `declareWinner: false` (short game): stops the round outright without
//   resolving it as a win or loss for anyone still unfinished — `placements`
//   is left exactly as it was, winnerSeatId stays null, and `endedEarly`
//   tells placementFor to return null rather than "last place" for whoever
//   hadn't finished yet.
// - `declareWinner: true` (long enough game): ranks every seat that hadn't
//   already finished by seatProgress (furthest along first) and appends
//   them to `placements` — except whichever seat(s) tie for the very
//   lowest progress, left unplaced, same as the one implicit loser a
//   natural finish leaves out (or the tied group a mid-game removal can
//   leave — see removeSeatFromGame above). Anyone who *had* already
//   finished keeps their real, earlier placement ahead of this new group.
//   `endedEarly` is cleared once this actually resolves someone, so
//   placementFor's normal "resolved game" fallback ranks the excluded
//   tied-lowest group last (seats.length) instead of leaving them null —
//   this is meant to count as a real result, not stay unresolved. The one
//   exception: every remaining seat tied exactly (nothing to rank apart),
//   which just falls back to the same unresolved shape as a short early
//   end rather than guessing.
export function endGame(state, { declareWinner = false } = {}) {
  if (state.status !== "playing") return state;
  if (!declareWinner) {
    return { ...state, status: "finished", winnerSeatId: null, endedEarly: true, diceValue: null };
  }

  const alreadyFinished = new Set(state.placements);
  const remaining = state.seats.filter((s) => !alreadyFinished.has(s.id));
  const ranked = remaining
    .map((s) => ({ id: s.id, progress: seatProgress(s) }))
    .sort((a, b) => b.progress - a.progress);
  const lowest = ranked[ranked.length - 1]?.progress;
  const newlyPlaced = ranked.filter((r) => r.progress > lowest).map((r) => r.id);
  const placements = [...state.placements, ...newlyPlaced];
  const resolved = newlyPlaced.length > 0 || remaining.length === 0;

  return {
    ...state,
    status: "finished",
    winnerSeatId: resolved ? placements[0] ?? null : null,
    endedEarly: !resolved,
    diceValue: null,
    placements,
  };
}

// Makes a seat playable again — the opposite of removeSeatFromGame's
// terminal `finished`, and also how a suspension ends, whether that's the
// original account reconnecting or a different one claiming the seat
// (see rooms.js's reconnectSeats/claimSeat). Tokens are left exactly as
// they are: already at the yard if this seat had been removed, or
// wherever they were sitting if it had only been suspended.
// inactivityLevel resets too — a new occupant claiming the seat (see
// claimSeat) must not inherit whoever had it before's decayed deadline,
// and giving the same occupant a clean slate on resume is a reasonable
// simplification (the level was frozen, not advancing, the whole time
// they were suspended anyway).
export function reactivateSeat(state, seatId) {
  const seats = state.seats.map((s) =>
    s.id === seatId ? { ...s, finished: false, suspended: false, inactivityLevel: 0 } : s
  );
  return { ...state, seats };
}

// Reset to level 0 — call after a seat's own genuine roll/move (see
// server.js's game:rollDice/game:moveToken handlers, gated on the call
// actually having changed state, not just been addressed to this seat —
// a stale/no-op call must not undo a timeout that already advanced it).
export function resetInactivity(state, seatId) {
  return { ...state, seats: state.seats.map((s) => (s.id === seatId ? { ...s, inactivityLevel: 0 } : s)) };
}

// Advance one level (clamped) — call when the server's own turn-timeout
// sweep is what actually rolled/moved for a *connected* seat (see
// server.js's sweepTurnTimeouts), never for a bot or disconnected seat's
// own auto-play, which isn't a human being penalized for inactivity.
export function advanceInactivity(state, seatId) {
  const max = INACTIVITY_TIMEOUTS_MS.length - 1;
  return {
    ...state,
    seats: state.seats.map((s) =>
      s.id === seatId ? { ...s, inactivityLevel: Math.min((s.inactivityLevel ?? 0) + 1, max) } : s
    ),
  };
}
