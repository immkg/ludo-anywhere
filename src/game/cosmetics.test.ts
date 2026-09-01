import { describe, it, expect } from "vitest";
import {
  isBoardFinishId,
  isDiceSkinId,
  isTokenStyleId,
  resolveBoardFinishFill,
  resolveDiceSkin,
  resolveTokenStyle,
} from "./cosmetics";

describe("resolveTokenStyle", () => {
  it("falls back to classic for an unknown id", () => {
    expect(resolveTokenStyle("not-a-real-style")).toEqual(resolveTokenStyle("classic"));
  });

  it("classic is a plain circle", () => {
    expect(resolveTokenStyle("classic").shape).toBe("circle");
  });

  it("angular swaps in a faceted polygon shape", () => {
    const style = resolveTokenStyle("angular");
    expect(style.shape).toBe("polygon");
    expect(style.sides).toBeGreaterThanOrEqual(3);
  });

  it("jewel keeps the circle shape but changes the border/highlight", () => {
    const jewel = resolveTokenStyle("jewel");
    const classic = resolveTokenStyle("classic");
    expect(jewel.shape).toBe("circle");
    expect(jewel.borderColor).not.toBe(classic.borderColor);
  });
});

describe("resolveBoardFinishFill", () => {
  it("falls back to a solid fill for an unknown id", () => {
    expect(resolveBoardFinishFill("not-a-real-finish", "#E8262C", 100, 100)).toEqual({
      kind: "solid",
      fill: "#E8262C",
    });
  });

  it("classic is a flat solid fill using the arm's own color", () => {
    expect(resolveBoardFinishFill("classic", "#1F9E4C", 100, 100)).toEqual({ kind: "solid", fill: "#1F9E4C" });
  });

  it("gradient spans the full given width/height and stays anchored to the arm color", () => {
    const fill = resolveBoardFinishFill("gradient", "#1565E8", 200, 150);
    expect(fill.kind).toBe("gradient");
    if (fill.kind !== "gradient") throw new Error("expected gradient");
    expect(fill.fillLinearGradientStartPoint).toEqual({ x: 0, y: 0 });
    expect(fill.fillLinearGradientEndPoint).toEqual({ x: 200, y: 150 });
    expect(fill.fillLinearGradientColorStops).toHaveLength(4);
  });

  it("weave carries the base color through for Board.tsx's canvas pattern to use", () => {
    expect(resolveBoardFinishFill("weave", "#FFCC00", 100, 100)).toEqual({ kind: "weave", fill: "#FFCC00" });
  });
});

describe("resolveDiceSkin", () => {
  it("falls back to classic for an unknown id", () => {
    expect(resolveDiceSkin("not-a-real-skin")).toEqual(resolveDiceSkin("classic"));
  });

  it("each skin has distinct colors from the others", () => {
    const classic = resolveDiceSkin("classic");
    const midnight = resolveDiceSkin("midnight");
    const ivory = resolveDiceSkin("ivory");
    expect(new Set([classic.faceBg, midnight.faceBg, ivory.faceBg]).size).toBe(3);
    expect(new Set([classic.pipColor, midnight.pipColor, ivory.pipColor]).size).toBe(3);
  });
});

describe("id validators", () => {
  it("accept every id in their own list and reject junk", () => {
    expect(isTokenStyleId("jewel")).toBe(true);
    expect(isTokenStyleId("nope")).toBe(false);
    expect(isBoardFinishId("weave")).toBe(true);
    expect(isBoardFinishId("nope")).toBe(false);
    expect(isDiceSkinId("midnight")).toBe(true);
    expect(isDiceSkinId("nope")).toBe(false);
  });
});
