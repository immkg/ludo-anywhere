import { describe, it, expect } from "vitest";
import { computeGameXp, computeXp, getTrophyTier, nextTrophyTier, TROPHY_TIERS } from "./trophies";

describe("computeXp", () => {
  it("is 0 for a player who hasn't done anything yet", () => {
    expect(computeXp({ gamesWon: 0, gamesPlayed: 0, playTimeHours: 0 })).toBe(0);
  });

  it("weighs wins more than participation, and participation more than time", () => {
    expect(computeXp({ gamesWon: 1, gamesPlayed: 0, playTimeHours: 0 })).toBe(50);
    expect(computeXp({ gamesWon: 0, gamesPlayed: 1, playTimeHours: 0 })).toBe(10);
    expect(computeXp({ gamesWon: 0, gamesPlayed: 0, playTimeHours: 1 })).toBe(5);
  });

  it("never goes negative for any non-negative inputs", () => {
    expect(computeXp({ gamesWon: 0, gamesPlayed: 3, playTimeHours: 0.4 })).toBeGreaterThanOrEqual(0);
  });
});

describe("computeGameXp", () => {
  it("credits a normal win with both the win and participation bonus", () => {
    expect(computeGameXp({ isWinner: true, endedEarly: false, playTimeHours: 0 })).toBe(60); // 50 + 10
  });

  it("credits a normal (not-early) loss with just the participation bonus", () => {
    expect(computeGameXp({ isWinner: false, endedEarly: false, playTimeHours: 0 })).toBe(10);
  });

  it("does not count an early-ended loss as played — mirrors src/app/page.tsx's totals rule", () => {
    expect(computeGameXp({ isWinner: false, endedEarly: true, playTimeHours: 0 })).toBe(0);
  });

  it("still counts an early-ended game the viewer won", () => {
    expect(computeGameXp({ isWinner: true, endedEarly: true, playTimeHours: 0 })).toBe(60);
  });

  it("always folds in playtime, even for an early-ended loss", () => {
    expect(computeGameXp({ isWinner: false, endedEarly: true, playTimeHours: 1 })).toBe(5);
  });
});

describe("getTrophyTier", () => {
  it("starts everyone at tier 1 (Wooden Pawn)", () => {
    expect(getTrophyTier(0).name).toBe("Wooden Pawn");
  });

  it("returns the highest tier whose threshold has been met", () => {
    expect(getTrophyTier(99).level).toBe(1);
    expect(getTrophyTier(100).level).toBe(2);
    expect(getTrophyTier(6000).level).toBe(9);
    expect(getTrophyTier(999_999).level).toBe(9); // caps at the top tier, doesn't overflow
  });
});

describe("nextTrophyTier", () => {
  it("returns the tier right above the current one", () => {
    expect(nextTrophyTier(0)?.name).toBe("Bronze Roller");
  });

  it("returns null at the top tier", () => {
    expect(nextTrophyTier(TROPHY_TIERS[TROPHY_TIERS.length - 1].minXp)).toBeNull();
  });
});
