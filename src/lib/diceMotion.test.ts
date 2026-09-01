import { describe, it, expect } from "vitest";
import { arcKeyframes, bounceIntensities, randomBetween } from "./diceMotion";

// Returns a fixed sequence of values, one per call, cycling once exhausted —
// lets a test pin down exactly which "random" draw feeds which part of the
// formula under test.
function sequence(values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("randomBetween", () => {
  it("maps 0 to the min and 1 to the max", () => {
    expect(randomBetween(10, 20, () => 0)).toBe(10);
    expect(randomBetween(10, 20, () => 1)).toBe(20);
  });

  it("interpolates linearly in between", () => {
    expect(randomBetween(10, 20, () => 0.5)).toBe(15);
  });
});

describe("arcKeyframes", () => {
  it("produces no motion when from and to are the same point", () => {
    const { x, y } = arcKeyframes({ x: 5, y: 5 }, { x: 5, y: 5 });
    expect(x).toEqual([0, 0, 0]);
    expect(y).toEqual([0, 0, 0]);
  });

  it("always starts at 0 and ends at the to-from delta", () => {
    const { x, y } = arcKeyframes({ x: 10, y: 20 }, { x: 110, y: 20 }, () => 0.3);
    expect(x[0]).toBe(0);
    expect(y[0]).toBe(0);
    expect(x[2]).toBe(100);
    expect(y[2]).toBe(0);
  });

  it("lifts and drifts the midpoint by an amount derived from the draws given", () => {
    // dx=100, dy=0 -> dist=100.
    // draw 1 (arcLift's randomBetween(0.25,0.45)): 0.5 -> 0.35 -> arcLift=35
    // draw 2 (sideDrift's sign check, <0.5): 0 -> true -> sign=-1
    // draw 3 (sideDrift's randomBetween(0.05,0.2)): 0.5 -> 0.125 -> magnitude=12.5
    const { x, y } = arcKeyframes(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      sequence([0.5, 0, 0.5]),
    );
    expect(x).toEqual([0, 37.5, 100]);
    expect(y).toEqual([0, -35, 0]);
  });

  it("flips the sideways drift's sign based on the sign-check draw", () => {
    const positiveDrift = arcKeyframes({ x: 0, y: 0 }, { x: 100, y: 0 }, sequence([0.5, 1, 0.5]));
    const negativeDrift = arcKeyframes({ x: 0, y: 0 }, { x: 100, y: 0 }, sequence([0.5, 0, 0.5]));
    expect(positiveDrift.x[1]).toBeGreaterThan(50);
    expect(negativeDrift.x[1]).toBeLessThan(50);
  });
});

describe("bounceIntensities", () => {
  it("returns one intensity per bounce requested", () => {
    expect(bounceIntensities(3)).toHaveLength(3);
  });

  it("tapers off from a stronger first bounce to weaker later ones", () => {
    const [first, second, third] = bounceIntensities(3);
    expect(first).toBeGreaterThan(second);
    expect(second).toBeGreaterThan(third);
  });

  it("always keeps every intensity positive", () => {
    for (const intensity of bounceIntensities(5)) {
      expect(intensity).toBeGreaterThan(0);
    }
  });
});
