import { describe, it, expect } from "vitest";
import {
  createGame,
  moveToken,
  placementFor,
  suspendSeat,
  removeSeatFromGame,
  reactivateSeat,
  endGame,
  timeoutsForLevel,
  INACTIVITY_TIMEOUTS_MS,
  resetInactivity,
  advanceInactivity,
} from "./engine.js";
import { finished, tokenPixelPosition, buildBoardLayout } from "./board.js";

function seats(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `seat-${i}`, armIndex: i }));
}

// Puts one seat's last token one step from finishing (its other 3 already
// home) and sets it as the current seat with a matching dice value, so
// calling moveToken with that token index finishes the seat outright.
function primeSeatToFinish(state, seatIndex, dice = 1) {
  const seat = state.seats[seatIndex];
  const tokens = [finished(), finished(), finished(), finished() - dice];
  return {
    ...state,
    seats: state.seats.map((s, i) => (i === seatIndex ? { ...seat, tokens } : s)),
    currentSeatIndex: seatIndex,
    diceValue: dice,
  };
}

describe("multi-place finishing", () => {
  it("starts with an empty placements list", () => {
    const state = createGame(seats(4));
    expect(state.placements).toEqual([]);
    expect(state.status).toBe("playing");
  });

  it("keeps a 4-seat game playing after the first finish", () => {
    let state = createGame(seats(4));
    state = primeSeatToFinish(state, 0);
    state = moveToken(state, "seat-0", 3);

    expect(state.status).toBe("playing");
    expect(state.placements).toEqual(["seat-0"]);
    expect(state.seats[0].finished).toBe(true);
    expect(placementFor(state, "seat-0")).toBe(1);
    expect(placementFor(state, "seat-1")).toBeNull();
  });

  it("never grants a bonus turn for the move that finishes a seat, even on a six", () => {
    let state = createGame(seats(4));
    state = primeSeatToFinish(state, 0, 6); // finishes exactly on a rolled six
    state = moveToken(state, "seat-0", 3);

    // A six normally grants a bonus turn (same seat rolls again) — but
    // finishing should always pass play on regardless.
    expect(state.currentSeatIndex).not.toBe(0);
    expect(state.seats[state.currentSeatIndex].finished).toBe(false);
  });

  it("skips already-finished seats when picking the next turn", () => {
    let state = createGame(seats(3));
    state = primeSeatToFinish(state, 0);
    state = moveToken(state, "seat-0", 3);
    expect(state.currentSeatIndex).toBe(1); // seat-0 finished, next is seat-1
  });

  it("ends the game once only one seat is left unfinished, ranking up to 3 winners + 1 loser", () => {
    let state = createGame(seats(4));

    state = primeSeatToFinish(state, 0);
    state = moveToken(state, "seat-0", 3);
    expect(state.status).toBe("playing");

    state = primeSeatToFinish(state, 1);
    state = moveToken(state, "seat-1", 3);
    expect(state.status).toBe("playing");

    state = primeSeatToFinish(state, 2);
    state = moveToken(state, "seat-2", 3);

    // Only seat-3 is left unfinished — the game ends right there, seat-3
    // never has to actually finish to be "the loser".
    expect(state.status).toBe("finished");
    expect(state.placements).toEqual(["seat-0", "seat-1", "seat-2"]);
    expect(state.winnerSeatId).toBe("seat-0");

    expect(placementFor(state, "seat-0")).toBe(1);
    expect(placementFor(state, "seat-1")).toBe(2);
    expect(placementFor(state, "seat-2")).toBe(3);
    expect(placementFor(state, "seat-3")).toBe(4); // the implicit loser
  });

  it("ends immediately in a 2-seat game — one winner, one loser, no continued play", () => {
    let state = createGame(seats(2));
    state = primeSeatToFinish(state, 0);
    state = moveToken(state, "seat-0", 3);

    expect(state.status).toBe("finished");
    expect(state.placements).toEqual(["seat-0"]);
    expect(placementFor(state, "seat-1")).toBe(2);
  });
});

describe("finished token position (center-finish fix)", () => {
  it("places a finished token at its arm's finishSlots, not the last home-column cell", () => {
    const layout = buildBoardLayout();
    const arm = layout.arms[0];
    const lastHomeColumnCell = arm.homeColumn[arm.homeColumn.length - 1];

    const finishedPos = tokenPixelPosition(0, finished(), 0);
    expect(finishedPos).toEqual({ x: arm.finishSlots[0].x, y: arm.finishSlots[0].y });
    expect(finishedPos).not.toEqual({ x: lastHomeColumnCell.x, y: lastHomeColumnCell.y });

    // The finish slot should be closer to true board center than the old
    // home-column cell was.
    const distance = (p) => Math.hypot(p.x - layout.center.x, p.y - layout.center.y);
    expect(distance(finishedPos)).toBeLessThan(distance(lastHomeColumnCell));
  });

  it("spreads a seat's 4 finished tokens across distinct finishSlots", () => {
    const points = [0, 1, 2, 3].map((i) => tokenPixelPosition(0, finished(), i));
    const unique = new Set(points.map((p) => `${p.x},${p.y}`));
    expect(unique.size).toBe(4);
  });
});

describe("suspend / remove / reactivate", () => {
  it("skips a suspended seat's turn without touching its tokens", () => {
    let state = createGame(seats(4));
    state.seats[1].tokens = [10, 10, 10, 10]; // arbitrary, mid-board
    state = suspendSeat(state, "seat-1");

    expect(state.seats[1].suspended).toBe(true);
    expect(state.seats[1].tokens).toEqual([10, 10, 10, 10]); // untouched

    // seat-0's turn ends normally and should skip straight past seat-1.
    state = primeSeatToFinish(state, 0);
    state = moveToken(state, "seat-0", 3);
    expect(state.currentSeatIndex).toBe(2);
  });

  it("passes the turn on immediately when the current seat is suspended", () => {
    let state = createGame(seats(4)); // currentSeatIndex starts at 0
    state = suspendSeat(state, "seat-0");
    expect(state.currentSeatIndex).toBe(1);
  });

  it("does not end the round on '<=1 active' while a seat is still suspended", () => {
    let state = createGame(seats(3));
    state = suspendSeat(state, "seat-2");

    state = primeSeatToFinish(state, 0);
    state = moveToken(state, "seat-0", 3);
    // seat-1 is the only active (non-finished, non-suspended) seat left,
    // but seat-2 being suspended (not resolved) must hold the round open.
    expect(state.status).toBe("playing");
    expect(state.currentSeatIndex).toBe(1);
  });

  it("removing the suspended seat then lets the round end normally", () => {
    let state = createGame(seats(3));
    state = suspendSeat(state, "seat-2");
    state = primeSeatToFinish(state, 0);
    state = moveToken(state, "seat-0", 3);

    state = removeSeatFromGame(state, "seat-2");
    expect(state.status).toBe("finished");
    expect(state.placements).toEqual(["seat-0"]);
    // Both the natural loser and the removed seat tie for last place —
    // placementFor doesn't distinguish "never finished" from "removed".
    expect(placementFor(state, "seat-1")).toBe(3);
    expect(placementFor(state, "seat-2")).toBe(3);
  });

  it("removal clears tokens to the yard and can't be undone by finishing later", () => {
    let state = createGame(seats(4));
    state.seats[2].tokens = [10, 10, 10, 10];
    state = removeSeatFromGame(state, "seat-2");

    expect(state.seats[2].tokens).toEqual([-1, -1, -1, -1]); // YARD
    expect(state.seats[2].finished).toBe(true);
    expect(state.placements).not.toContain("seat-2"); // never actually "won"
  });

  it("removal ends the round immediately if only one active seat is left", () => {
    let state = createGame(seats(3));
    state = removeSeatFromGame(state, "seat-1");
    expect(state.status).toBe("playing"); // seat-0 and seat-2 both still active

    state = removeSeatFromGame(state, "seat-2");
    expect(state.status).toBe("finished");
    expect(state.placements).toEqual([]); // nobody actually won this one
    expect(placementFor(state, "seat-0")).toBe(3);
  });

  it("reactivateSeat makes a removed or suspended seat playable again", () => {
    let state = createGame(seats(3));
    state = removeSeatFromGame(state, "seat-1");
    expect(state.seats[1].finished).toBe(true);

    state = reactivateSeat(state, "seat-1");
    expect(state.seats[1].finished).toBe(false);
    expect(state.seats[1].suspended).toBe(false);
    expect(state.seats[1].tokens).toEqual([-1, -1, -1, -1]); // still at yard from the removal
  });
});

describe("endGame", () => {
  it("without declareWinner, leaves everyone unfinished unresolved", () => {
    let state = createGame(seats(4));
    state.seats[0].tokens = [10, 10, 10, 10];
    state = endGame(state);

    expect(state.status).toBe("finished");
    expect(state.endedEarly).toBe(true);
    expect(state.winnerSeatId).toBeNull();
    expect(state.placements).toEqual([]);
    expect(placementFor(state, "seat-0")).toBeNull();
  });

  it("declareWinner ranks unfinished seats by total token progress, excluding the tied-lowest", () => {
    let state = createGame(seats(4));
    state.seats[0].tokens = [10, 10, 10, 10]; // progress 44 — furthest along
    state.seats[1].tokens = [-1, -1, -1, -1]; // progress 0 — never left the yard
    state.seats[2].tokens = [20, -1, -1, -1]; // progress 21
    state.seats[3].tokens = [5, 5, -1, -1]; // progress 12
    state = endGame(state, { declareWinner: true });

    expect(state.status).toBe("finished");
    expect(state.endedEarly).toBe(false); // this resolved a real result
    expect(state.winnerSeatId).toBe("seat-0");
    expect(state.placements).toEqual(["seat-0", "seat-2", "seat-3"]);
    expect(placementFor(state, "seat-0")).toBe(1);
    expect(placementFor(state, "seat-2")).toBe(2);
    expect(placementFor(state, "seat-3")).toBe(3);
    // The lowest-progress seat is excluded from placements, same shape as
    // a natural finish's one implicit loser — placementFor still ranks it
    // last since the game resolved (endedEarly is false).
    expect(state.placements).not.toContain("seat-1");
    expect(placementFor(state, "seat-1")).toBe(4);
  });

  it("declareWinner keeps an already-finished seat's real placement ahead of the newly-ranked group", () => {
    let state = createGame(seats(3));
    state = { ...state, placements: ["seat-0"] }; // seat-0 already finished naturally
    state.seats[1].tokens = [15, -1, -1, -1];
    state.seats[2].tokens = [3, -1, -1, -1];
    state = endGame(state, { declareWinner: true });

    expect(state.placements).toEqual(["seat-0", "seat-1"]);
    expect(state.winnerSeatId).toBe("seat-0");
    expect(placementFor(state, "seat-2")).toBe(3);
  });

  it("declareWinner with every remaining seat exactly tied stays unresolved for them", () => {
    let state = createGame(seats(2));
    state.seats[0].tokens = [7, -1, -1, -1];
    state.seats[1].tokens = [7, -1, -1, -1];
    state = endGame(state, { declareWinner: true });

    expect(state.endedEarly).toBe(true);
    expect(state.winnerSeatId).toBeNull();
    expect(state.placements).toEqual([]);
    expect(placementFor(state, "seat-0")).toBeNull();
    expect(placementFor(state, "seat-1")).toBeNull();
  });
});

describe("inactivity decay", () => {
  it("createGame starts every seat at level 0", () => {
    const state = createGame(seats(4));
    state.seats.forEach((s) => expect(s.inactivityLevel).toBe(0));
  });

  it("timeoutsForLevel returns the table entry and clamps at the floor", () => {
    expect(timeoutsForLevel(0)).toEqual([10000, 15000]);
    expect(timeoutsForLevel(1)).toEqual([8000, 12000]);
    expect(timeoutsForLevel(2)).toEqual([6000, 9000]);
    expect(timeoutsForLevel(3)).toEqual([5000, 6000]);
    expect(timeoutsForLevel(10)).toEqual([5000, 6000]); // floors, doesn't decay forever
    expect(timeoutsForLevel(undefined)).toEqual([10000, 15000]); // treated as level 0
  });

  it("advanceInactivity increments one seat's level, clamped at the table's last index", () => {
    let state = createGame(seats(2));
    state = advanceInactivity(state, "seat-0");
    expect(state.seats[0].inactivityLevel).toBe(1);
    expect(state.seats[1].inactivityLevel).toBe(0); // untouched

    for (let i = 0; i < 10; i++) state = advanceInactivity(state, "seat-0");
    expect(state.seats[0].inactivityLevel).toBe(INACTIVITY_TIMEOUTS_MS.length - 1);
  });

  it("resetInactivity brings a seat back to level 0", () => {
    let state = createGame(seats(2));
    state = advanceInactivity(state, "seat-0");
    state = advanceInactivity(state, "seat-0");
    expect(state.seats[0].inactivityLevel).toBe(2);

    state = resetInactivity(state, "seat-0");
    expect(state.seats[0].inactivityLevel).toBe(0);
  });

  it("reactivateSeat also resets inactivityLevel — a new occupant shouldn't inherit a decayed deadline", () => {
    let state = createGame(seats(2));
    state = advanceInactivity(state, "seat-0");
    state = advanceInactivity(state, "seat-0");
    state = reactivateSeat(state, "seat-0");
    expect(state.seats[0].inactivityLevel).toBe(0);
  });
});
