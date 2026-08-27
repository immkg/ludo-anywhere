"use client";

import { useEffect, useRef, useState } from "react";
import { tokenPixelPosition, YARD, finished, type Point } from "@/game/board";
import { playPlup, playSmoosh, playHomeChime, playVictoryFanfare } from "@/lib/sound";

function easeInOutQuad(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export const STEP_MS = 140; // one ring/home cell hop
const ENTER_MS = 220; // leaving the yard onto the start cell
const RETRACE_STEP_MS = 70; // one hop while retreating after a capture — quicker than an ordinary hop
const FINISH_POS = finished();

// Animates a token's pixel position cell-by-cell along the track instead of
// tweening in a straight line to the destination — a straight-line tween
// cuts across the board's rectilinear path (and through the center) instead
// of following it. Plays a "plup" as each ordinary hop lands.
//
// `captureDelayMs` only matters the instant this token gets sent back to the
// yard: it holds the retreat off until the attacking token has visually
// finished walking onto this cell, so the "beating" reads as attacker
// arrives, *then* victim flees, rather than both moving at once.
//
// `finishSound` only matters the instant this token lands on the home/finish
// slot: "chime" for an ordinary token finishing, "victory" when it's the
// seat's last token home. See Board.tsx for how both are computed.
export function useSteppedToken(
  armIndex: number,
  pos: number,
  tokenIndex: number,
  captureDelayMs = 0,
  finishSound?: "chime" | "victory"
): Point {
  const [render, setRender] = useState<Point>(() => tokenPixelPosition(armIndex, pos, tokenIndex));
  const posRef = useRef<Point>(render);
  const prevPosRef = useRef(pos);
  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrored into refs via their own effects (never written during render —
  // see the react-hooks/refs rule) rather than taken as dependencies of the
  // animation effect below: a reconciling setGame that lands the same state
  // again (the server echo of an optimistic local move) would otherwise
  // re-fire that effect purely because one of these changed, tearing down
  // an in-flight retreat/hop mid-animation even though pos itself never
  // moved. Declared before the animation effect so — same commit, both
  // deps changing — React runs these first and it reads the fresh value.
  const captureDelayRef = useRef(captureDelayMs);
  useEffect(() => {
    captureDelayRef.current = captureDelayMs;
  }, [captureDelayMs]);
  const finishSoundRef = useRef(finishSound);
  useEffect(() => {
    finishSoundRef.current = finishSound;
  }, [finishSound]);

  useEffect(() => {
    const prevPos = prevPosRef.current;
    prevPosRef.current = pos;
    if (prevPos === pos) return;

    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    if (timeoutRef.current != null) clearTimeout(timeoutRef.current);

    const captured = prevPos !== YARD && pos === YARD;

    // Board positions only ever move forward one cell at a time, except
    // leaving the yard (single jump onto the start cell) and being captured
    // — which retraces every ring cell it had crossed, back to the yard,
    // instead of jumping straight there.
    const path: number[] = captured
      ? [...Array.from({ length: prevPos }, (_, i) => prevPos - 1 - i), YARD]
      : prevPos === YARD
        ? [pos]
        : Array.from({ length: pos - prevPos }, (_, i) => prevPos + i + 1);
    const singleStepDuration = captured ? RETRACE_STEP_MS : path.length === 1 ? ENTER_MS : STEP_MS;

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
        if (captured) {
          // silent — the smoosh already played when the retreat began
        } else if (path[stepIndex] === FINISH_POS) {
          if (finishSoundRef.current === "victory") playVictoryFanfare();
          else playHomeChime();
        } else {
          playPlup();
        }
        stepIndex += 1;
        if (stepIndex < path.length) rafRef.current = requestAnimationFrame(runStep);
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    const delay = captured ? captureDelayRef.current : 0;
    if (delay > 0) {
      timeoutRef.current = setTimeout(() => {
        playSmoosh();
        runStep();
      }, delay);
    } else {
      if (captured) playSmoosh();
      runStep();
    }

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (timeoutRef.current != null) clearTimeout(timeoutRef.current);
    };
    // captureDelayMs/finishSound deliberately excluded — read via their refs instead (see above).
  }, [armIndex, pos, tokenIndex]);

  return render;
}
