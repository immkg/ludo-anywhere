"use client";

import { useState } from "react";
import type Konva from "konva";
import { Arc, Circle, Ellipse, Group, Line } from "react-konva";
import { useFade, useRotation } from "@/hooks/useAnimatedPoint";
import { useSteppedToken } from "@/hooks/useSteppedToken";

const WHITE = "#DFDACD"; // a warm off-white (not pure white) — softer against the now-darker disc colors, still reads as "white border".
const SHADOW = "#463B2E"; // soft warm gray, not flat black — a physical piece's shadow on a board, not a graphic drop-shadow.

// Blends `hex` toward white (amount > 0) or black (amount < 0) — used only
// for a gentle radial gradient across the disc's own fill (still one flat
// color at a glance, just enough falloff to read as subtly domed/lit from
// above rather than a flat cutout) and a soft highlight, not a glossy gem.
function shade(hex: string, amount: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const target = amount >= 0 ? 255 : 0;
  const t = Math.abs(amount);
  const mix = (c: number) => Math.round(c * (1 - t) + target * t);
  // Hex (not rgb()) so a shaded result can itself be fed back into shade()
  // — see discColor below, which darkens the base color once and is then
  // shaded again (lighter/darker) for the gradient's own stops.
  const toHex = (c: number) => c.toString(16).padStart(2, "0");
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

// Darkens `hex` for contrast by reducing HSL lightness (not blending
// toward black in RGB) — RGB blending drags a bright, low-saturation hue
// like yellow through olive/brown well before it reads as "a darker
// yellow." Cutting lightness by a fixed amount keeps the hue and
// saturation intact, so it stays recognizably the same color, just deeper.
function darkenForContrast(hex: string, lightnessDrop: number) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  const l2 = Math.max(0, l - lightnessDrop);

  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  let r2: number;
  let g2: number;
  let b2: number;
  if (s === 0) {
    r2 = g2 = b2 = l2;
  } else {
    const q = l2 < 0.5 ? l2 * (1 + s) : l2 + s - l2 * s;
    const p = 2 * l2 - q;
    r2 = hue2rgb(p, q, h + 1 / 3);
    g2 = hue2rgb(p, q, h);
    b2 = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (c: number) =>
    Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r2)}${toHex(g2)}${toHex(b2)}`;
}

// The legal-move ring's color: a darker, more saturated "neon" take on
// each player's actual board color (see colorForArm in src/game/board.js),
// hand-picked rather than derived — an electric variant isn't just a
// lighten/darken of the base swatch. Falls back to the base color itself
// for any hex not in this fixed set (there are only ever four).
const NEON_BY_COLOR: Record<string, string> = {
  "#E8262C": "#D40029", // red -> crimson neon
  "#1F9E4C": "#00A454", // green -> electric green neon
  "#FFCC00": "#BD9100", // yellow -> amber neon
  "#1565E8": "#0056E6", // blue -> electric blue neon
};
function neonFor(color: string) {
  return NEON_BY_COLOR[color] ?? color;
}

// The ring is a few separate arcs (not one solid circle) with different
// opacities, so its continuous rotation actually reads as motion instead
// of a static glowing outline.
const RING_SEGMENTS = [
  { start: 0, angle: 110, opacity: 1 },
  { start: 135, angle: 65, opacity: 0.55 },
  { start: 230, angle: 85, opacity: 0.28 },
];
const RING_ROTATE_MS = 2800;
const RING_FADE_MS = 200;

// Every measurement is a fraction of this baseline (the design's original
// fixed 18px collar radius) — Board.tsx passes the actual `radius` a token
// should render at (its outer edge, sized to match the board's cell), and
// everything scales off that via `k`. The token's own outer edge (fill +
// white border) always lands exactly at `radius`, legal-move ring or not —
// only the ring itself extends beyond it.
const BASE_COLLAR_RADIUS = 18;

function setCursor(e: Konva.KonvaEventObject<Event>, cursor: string) {
  const container = e.target.getStage()?.container();
  if (container) container.style.cursor = cursor;
}

type TokenProps = {
  armIndex: number;
  pos: number;
  tokenIndex: number;
  offsetX?: number;
  offsetY?: number;
  color: string;
  selectable: boolean;
  // Outer (collar) radius this token should render at — see Board.tsx,
  // which sizes it to the board's own cell so a token's diameter matches
  // a cell's. This never changes for the legal-move state; only the ring
  // drawn outside it does.
  radius: number;
  // Flattened [x0, y0, x1, y1, ...] polygon points, in this token's own
  // local space, for its Voronoi territory (see Board.tsx). Only meaningful
  // (and only ever set) while selectable; falls back to a plain circle
  // otherwise, which is never actually hit-tested since a non-selectable
  // token's Group doesn't listen for events at all.
  hitPoints?: number[];
  // How long (ms) to hold off this token's capture retreat so it starts
  // only once the attacking token has visually reached it — see Board.tsx,
  // which computes this from the mover's own hop count. Irrelevant except
  // at the instant this token gets sent back to the yard.
  captureDelayMs?: number;
  // Which sound (if any) this token's landing on the home/finish slot
  // should play — "victory" when this is the seat's last token to arrive,
  // "chime" for any other token finishing. See Board.tsx.
  finishSound?: "chime" | "victory";
  onTap?: () => void;
};

export default function Token({
  armIndex,
  pos,
  tokenIndex,
  offsetX = 0,
  offsetY = 0,
  color,
  selectable,
  radius,
  hitPoints,
  captureDelayMs,
  finishSound,
  onTap,
}: TokenProps) {
  const { x: rawX, y: rawY } = useSteppedToken(armIndex, pos, tokenIndex, captureDelayMs, finishSound);
  const px = rawX + offsetX;
  const py = rawY + offsetY;
  const [hovered, setHovered] = useState(false);

  // A stable per-token phase offset so multiple legal tokens' rings don't
  // all rotate in perfect lockstep — deterministic (not Math.random()) so
  // it doesn't jump around on re-render.
  const phaseDeg = ((armIndex * 4 + tokenIndex) * 53) % 360;
  const spin = useRotation(selectable, RING_ROTATE_MS);
  const ringOpacity = useFade(selectable ? 1 : 0, RING_FADE_MS);

  const k = radius / BASE_COLLAR_RADIUS;
  const borderWidth = 4.5 * k;
  // Konva strokes are centered on the path, so shrinking the fill radius
  // by half the border width keeps the *outer* edge (fill + border) at
  // exactly `radius` — the token's true, unchanging footprint.
  const discRadius = radius - borderWidth / 2;
  const defaultHitRadius = 27 * k;

  const neon = neonFor(color);
  const ringInner = radius + 5 * k;
  const ringOuter = ringInner + 6 * k;
  const hoverBoost = hovered ? 1.15 : 1;
  // The disc itself renders a darker shade of the arm's color rather than
  // the exact hex behind it on the board — same hue, but enough contrast
  // to stay clearly readable against its own quadrant instead of blending
  // into it. `color` (the true arm color) still drives the neon ring.
  const discColor = darkenForContrast(color, 0.14);

  return (
    <Group
      x={px}
      y={py}
      onClick={onTap}
      onTap={onTap}
      onMouseEnter={(e) => {
        if (!selectable) return;
        setCursor(e, "pointer");
        setHovered(true);
      }}
      onMouseLeave={(e) => {
        if (!selectable) return;
        setCursor(e, "default");
        setHovered(false);
      }}
      listening={selectable}
    >
      {/* Bigger-than-the-token, invisible hit area — Konva still hit-tests
          a shape with opacity 0 as long as it has a fill, so this widens
          the tap target without changing what's drawn. Its own Voronoi
          territory when one was computed (see Board.tsx), otherwise a
          plain circle that's never actually hit-tested (selectable=false
          means the Group itself isn't listening). */}
      {hitPoints && hitPoints.length >= 6 ? (
        <Line points={hitPoints} closed fill={color} opacity={0} />
      ) : (
        <Circle radius={defaultHitRadius} fill={color} opacity={0} />
      )}

      {/* Legal-move affordance: a rotating, segmented neon ring entirely
          outside the token's own border — never resizes or recolors the
          token itself. The token doesn't rotate; only this ring does. */}
      {ringOpacity > 0.01 && (
        <Group rotation={spin + phaseDeg} listening={false}>
          {RING_SEGMENTS.map((seg, i) => (
            <Arc
              key={i}
              innerRadius={ringInner}
              outerRadius={ringOuter}
              angle={seg.angle}
              rotation={seg.start}
              fill={neon}
              opacity={Math.min(1, seg.opacity * hoverBoost) * ringOpacity}
              shadowColor={neon}
              shadowBlur={7 * k * hoverBoost}
              shadowOpacity={0.85 * ringOpacity}
            />
          ))}
        </Group>
      )}

      {/* The disc itself: still top-down and one player color at a glance,
          but a gentle radial gradient (lit from the upper-left, like every
          other light source on this board) gives it a subtly domed,
          slightly-raised feel instead of a flat cutout. Konva's own shadow
          (not a separate shape) adds the lift underneath. */}
      <Circle
        radius={discRadius}
        fillRadialGradientStartPoint={{ x: -discRadius * 0.35, y: -discRadius * 0.4 }}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndPoint={{ x: 0, y: 0 }}
        fillRadialGradientEndRadius={discRadius * 1.05}
        fillRadialGradientColorStops={[0, shade(discColor, 0.16), 0.6, discColor, 1, shade(discColor, -0.08)]}
        stroke={WHITE}
        strokeWidth={borderWidth}
        shadowColor={SHADOW}
        shadowBlur={4 * k}
        shadowOffset={{ x: 0, y: 1.5 * k }}
        shadowOpacity={hovered ? 0.4 : 0.32}
      />

      {/* A small, soft highlight — just enough to read as a rounded top
          surface catching light, not a glossy gem's hot spot. */}
      <Ellipse
        radiusX={discRadius * 0.42}
        radiusY={discRadius * 0.28}
        x={-discRadius * 0.28}
        y={-discRadius * 0.32}
        rotation={-28}
        fill="white"
        opacity={0.16}
        listening={false}
      />
    </Group>
  );
}
