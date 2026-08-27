"use client";

import { useEffect, useRef, useState } from "react";
import { tokenPixelPosition, YARD, type Point } from "@/game/board";
import { playPlup } from "@/lib/sound";

function easeInOutQuad(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

const STEP_MS = 140; // one ring/home cell hop
const ENTER_MS = 220; // leaving the yard onto the start cell
const RECALL_MS = 380; // captured and sent back to the yard

// Animates a token's pixel position cell-by-cell along the track instead of
// tweening in a straight line to the destination — a straight-line tween
// cuts across the board's rectilinear path (and through the center) instead
// of following it. Plays a "plup" as each hop lands.
export function useSteppedToken(armIndex: number, pos: number, tokenIndex: number): Point {
  const [render, setRender] = useState<Point>(() => tokenPixelPosition(armIndex, pos, tokenIndex));
  const posRef = useRef<Point>(render);
  const prevPosRef = useRef(pos);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const prevPos = prevPosRef.current;
    prevPosRef.current = pos;
    if (prevPos === pos) return;

    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);

    // Board positions only ever move forward one cell at a time, except
    // leaving the yard (single jump onto the start cell) and being
    // captured (single jump back to the yard) — both animate directly.
    const path: number[] =
      prevPos === YARD || pos < prevPos
        ? [pos]
        : Array.from({ length: pos - prevPos }, (_, i) => prevPos + i + 1);
    const singleStepDuration = path.length === 1 ? (prevPos === YARD ? ENTER_MS : RECALL_MS) : STEP_MS;

    let stepIndex = 0;

    function runStep() {
      const from = posRef.current;
      const to = tokenPixelPosition(armIndex, path[stepIndex], tokenIndex);
      const stepStart = performance.now();

      function tick(now: number) {
        const t = Math.min(1, (now - stepStart) / singleStepDuration);
        const eased = easeInOutQuad(t);
        const next = { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased };
        posRef.current = next;
        setRender(next);
        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        posRef.current = to;
        setRender(to);
        playPlup();
        stepIndex += 1;
        if (stepIndex < path.length) rafRef.current = requestAnimationFrame(runStep);
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    runStep();

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [armIndex, pos, tokenIndex]);

  return render;
}
