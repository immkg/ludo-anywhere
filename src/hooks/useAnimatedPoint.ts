"use client";

import { useEffect, useRef, useState } from "react";

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

// Smoothly tweens toward (x, y) whenever it changes, instead of snapping —
// used to slide tokens across the board on a canvas, where (unlike SVG/CSS)
// there's no built-in transition for a shape's position.
export function useAnimatedPoint(x: number, y: number, duration = 320) {
  const [pos, setPos] = useState({ x, y });
  const posRef = useRef({ x, y });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    const startPos = posRef.current;
    if (startPos.x === x && startPos.y === y) return;
    const start = performance.now();

    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(t);
      const next = { x: startPos.x + (x - startPos.x) * eased, y: startPos.y + (y - startPos.y) * eased };
      posRef.current = next;
      setPos(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [x, y, duration]);

  return pos;
}

// A slow sine pulse between min/max, used for the "you can move this" halo.
export function usePulse(active: boolean, min = 14, max = 21, duration = 1100) {
  const [r, setR] = useState(min);

  useEffect(() => {
    if (!active) return;
    let raf: number;
    const start = performance.now();
    function tick(now: number) {
      const t = ((now - start) % duration) / duration;
      const wave = (Math.sin(t * Math.PI * 2 - Math.PI / 2) + 1) / 2;
      setR(min + wave * (max - min));
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, min, max, duration]);

  return active ? r : min;
}
