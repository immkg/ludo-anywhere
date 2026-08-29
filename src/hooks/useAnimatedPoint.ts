"use client";

import { useEffect, useRef, useState } from "react";

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

// Continuous linear rotation (degrees, 0..360, wrapping) while `active` —
// used for the legal-move ring, which spins around a token that itself
// stays perfectly still. Freezes at its last angle once inactive, so a
// fade-out (see useFade) doesn't also have to fight a moving target.
export function useRotation(active: boolean, durationMs = 2800) {
  const [deg, setDeg] = useState(0);

  useEffect(() => {
    if (!active) return;
    let raf: number;
    const start = performance.now();
    function tick(now: number) {
      const t = ((now - start) % durationMs) / durationMs;
      setDeg(t * 360);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, durationMs]);

  return deg;
}

// Smoothly ramps toward `target` over `durationMs` instead of snapping —
// used for the legal-move ring's fade in/out. Re-targeting mid-ramp (e.g.
// selectable flips twice in quick succession) starts from wherever the
// value actually is, not the previous target.
export function useFade(target: number, durationMs = 200) {
  const [value, setValue] = useState(target);
  const valueRef = useRef(target);

  useEffect(() => {
    if (valueRef.current === target) return;
    const from = valueRef.current;
    let raf: number;
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = from + (target - from) * t;
      valueRef.current = eased;
      setValue(eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}
