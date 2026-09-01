import type { useAnimationControls } from "framer-motion";

// framer-motion doesn't export its `useAnimationControls()` return type under
// its own name (it's an internal `LegacyAnimationControls`, not re-exported)
// — deriving it this way instead keeps this file working across
// framer-motion versions without depending on that internal name.
type AnimationControls = ReturnType<typeof useAnimationControls>;

export type Point = { x: number; y: number };

export function randomBetween(
  min: number,
  max: number,
  random: () => number = Math.random,
): number {
  return min + random() * (max - min);
}

export type ArcKeyframes = {
  x: [number, number, number];
  y: [number, number, number];
};

// Builds the x/y keyframe triples (start, mid, end) for a curved throw from
// `from` to `to`, both expressed in whatever coordinate space the caller's
// own animation controls treat as "resting" (0,0) — e.g. Dice.tsx's
// throwOntoBoard animates its die from its resting spot out onto the board,
// and GameView.tsx's corner-to-corner handoff animates the floating die
// back from wherever it just was to its new corner's resting spot. Both are
// just "animate this offset from A to B along an arc, not a straight line",
// so they share this one function.
//
// The path isn't a straight line: an intermediate point, 55% of the way
// through (matching the `times` both callers use for the transition this
// feeds), is lifted up (as if thrown/tossed) and drifted sideways (so it
// doesn't look like a perfectly straight ramp), by an amount proportional
// to the travel distance and randomized per call.
export function arcKeyframes(
  from: Point,
  to: Point,
  random: () => number = Math.random,
): ArcKeyframes {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const arcLift = dist * randomBetween(0.25, 0.45, random);
  const sideDrift =
    (random() < 0.5 ? -1 : 1) * dist * randomBetween(0.05, 0.2, random);
  const midX = dx / 2 + sideDrift;
  const midY = dy / 2 - arcLift;
  return {
    x: [0, midX, dx],
    y: [0, midY, dy],
  };
}

// Per-bounce squash/stretch intensity for playSettleBounces below — pulled
// out as its own pure function so the falloff curve (strongest first,
// tapering out) is unit-testable without a real animation controller.
export function bounceIntensities(count: number): number[] {
  return Array.from({ length: count }, (_, i) => 0.16 * (1 - i / count) + 0.04);
}

// A couple of small squash-and-settle bounces on impact, shared by Dice.tsx's
// own flick-throw landing and GameView.tsx's corner-to-corner handoff
// landing — count and intensity both vary per call.
export async function playSettleBounces(controls: AnimationControls, count: number) {
  for (const intensity of bounceIntensities(count)) {
    await controls.start({
      scaleY: [1, 1 - intensity, 1 + intensity * 0.4, 1],
      scaleX: [1, 1 + intensity * 0.5, 1 - intensity * 0.2, 1],
      transition: { duration: 0.22, ease: "easeOut" },
    });
  }
}
