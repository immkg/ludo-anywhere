"use client";

import { useEffect, useState } from "react";

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
