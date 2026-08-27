"use client";

import type Konva from "konva";
import { Circle, Ellipse, Group, Line } from "react-konva";
import { usePulse } from "@/hooks/useAnimatedPoint";
import { useSteppedToken } from "@/hooks/useSteppedToken";

const INK = "#1A1410";

// A shared gold/ivory bezel across every arm color (rather than a flat
// tint of the piece's own color) — reads as a set of gemstones in a
// common setting, the way a premium physical piece would, instead of
// each color getting its own plain plastic disc.
const RIM_LIGHT = "#FFF6E0";
const RIM_MID = "#E9D19C";
const RIM_DARK = "#B4914F";
// A legal-move token's tell, since the bezel itself no longer changes
// color for that state (see the glow ring below) — a saturated, distinct
// hue the gold bezel and every gem color both contrast against.
const SELECT_GLOW = "#4FE0C8";

// Blends `hex` toward white (amount > 0) or black (amount < 0) — used to
// derive every highlight/shadow tone in the gem below from the arm's one
// base color, so the whole piece reads as one lit material rather than
// flat cutout shapes.
function shade(hex: string, amount: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const target = amount >= 0 ? 255 : 0;
  const t = Math.abs(amount);
  const mix = (c: number) => Math.round(c * (1 - t) + target * t);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

// Every measurement is a fraction of this baseline (the design's original
// fixed 18px collar radius) — Board.tsx passes the actual `radius` a token
// should render at (its outer, collar edge, sized to match the board's
// cell), and everything scales off that via `k`.
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
  // a cell's.
  radius: number;
  // Flattened [x0, y0, x1, y1, ...] polygon points, in this token's own
  // local space, for its Voronoi territory (see Board.tsx). Only meaningful
  // (and only ever set) while selectable; falls back to a plain circle
  // otherwise, which is never actually hit-tested since a non-selectable
  // token's Group doesn't listen for events at all.
  hitPoints?: number[];
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
  onTap,
}: TokenProps) {
  const { x: rawX, y: rawY } = useSteppedToken(armIndex, pos, tokenIndex);
  const px = rawX + offsetX;
  const py = rawY + offsetY;
  // A same-color ring around a same-size token was easy to miss (the ring
  // reads as another decoration, and gold-on-cream board cells barely
  // contrast). Growing and shrinking the whole piece is much harder to miss
  // at a glance, and doesn't depend on hue contrast at all.
  const pulseScale = usePulse(selectable, 1, 1.22, 700);

  const k = radius / BASE_COLLAR_RADIUS;
  const collarRadius = radius;
  const bezelRadius = collarRadius - 3.5 * k;
  const gemRadius = collarRadius - 6 * k;
  const defaultHitRadius = 27 * k;

  // Lit from the upper-left, like every other light source on this board
  // (see Token's collar shadow, the board's own drop shadow) — a single
  // consistent light direction is what makes a set of separately-drawn
  // pieces read as sitting under one real light instead of each being its
  // own flat sticker.
  const lightX = -gemRadius * 0.38;
  const lightY = -gemRadius * 0.45;

  return (
    <Group
      x={px}
      y={py}
      scaleX={pulseScale}
      scaleY={pulseScale}
      onClick={onTap}
      onTap={onTap}
      onMouseEnter={(e) => selectable && setCursor(e, "pointer")}
      onMouseLeave={(e) => selectable && setCursor(e, "default")}
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

      {/* Contact shadow, grounding the piece on the board. */}
      <Ellipse radiusX={11 * k} radiusY={4 * k} y={9 * k} fill={INK} opacity={0.28} />

      {/* The bezel is gold-toned regardless of state, so a legal-move
          token needs its own distinct tell beyond that — a bright glow
          just outside the piece, on top of the existing scale-pulse
          (which alone doesn't depend on hue contrast, but this reads at
          a glance even before the pulse animates). */}
      {selectable && (
        <Circle
          radius={collarRadius + 2 * k}
          stroke={SELECT_GLOW}
          strokeWidth={2.5 * k}
          shadowColor={SELECT_GLOW}
          shadowBlur={7 * k}
          shadowOpacity={0.95}
        />
      )}

      {/* Gold/ivory bezel — every color shares this, like gemstones in a
          common setting rather than each getting its own plastic disc. */}
      <Circle
        radius={collarRadius}
        fillRadialGradientStartPoint={{ x: lightX, y: lightY }}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndPoint={{ x: 0, y: 0 }}
        fillRadialGradientEndRadius={collarRadius * 1.15}
        fillRadialGradientColorStops={[0, RIM_LIGHT, 0.55, RIM_MID, 1, RIM_DARK]}
        strokeLinearGradientStartPoint={{ x: lightX, y: lightY }}
        strokeLinearGradientEndPoint={{ x: -lightX, y: -lightY }}
        strokeLinearGradientColorStops={[0, RIM_LIGHT, 1, "#7A5C28"]}
        strokeWidth={1.5 * k}
        shadowColor="black"
        shadowBlur={7 * k}
        shadowOffset={{ x: 0, y: 3.5 * k }}
        shadowOpacity={0.4}
      />

      {/* Thin inner bezel ring separating the gold setting from the gem. */}
      <Circle radius={bezelRadius} stroke={RIM_DARK} strokeWidth={1 * k} opacity={0.8} />

      {/* The gem itself: a strong 5-stop radial gradient (near-white hot
          spot fading through the true color to a near-black edge) reads
          as a glossy, lit sphere rather than a flat tinted circle — plus
          a matching gradient rim so the edge itself looks beveled, not
          outlined. */}
      <Circle
        radius={gemRadius}
        fillRadialGradientStartPoint={{ x: lightX, y: lightY }}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndPoint={{ x: gemRadius * 0.1, y: gemRadius * 0.1 }}
        fillRadialGradientEndRadius={gemRadius * 1.15}
        fillRadialGradientColorStops={[
          0,
          shade(color, 0.75),
          0.22,
          shade(color, 0.3),
          0.55,
          color,
          0.82,
          shade(color, -0.3),
          1,
          shade(color, -0.55),
        ]}
        strokeLinearGradientStartPoint={{ x: lightX, y: lightY }}
        strokeLinearGradientEndPoint={{ x: -lightX, y: -lightY }}
        strokeLinearGradientColorStops={[0, shade(color, 0.4), 1, shade(color, -0.65)]}
        strokeWidth={1.5 * k}
      />

      {/* Broad soft highlight — the "light hitting a curved glossy
          surface" effect, faded via gradient stops instead of an actual
          blur filter (cheaper, and Konva's shadowBlur doesn't apply to
          fills). */}
      <Ellipse
        radiusX={gemRadius * 0.62}
        radiusY={gemRadius * 0.42}
        x={lightX * 0.55}
        y={lightY * 0.75}
        rotation={-28}
        fillRadialGradientStartPoint={{ x: 0, y: 0 }}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndPoint={{ x: 0, y: 0 }}
        fillRadialGradientEndRadius={gemRadius * 0.62}
        fillRadialGradientColorStops={[0, "rgba(255,255,255,0.65)", 0.55, "rgba(255,255,255,0.2)", 1, "rgba(255,255,255,0)"]}
      />

      {/* Crisp specular glint — the small, near-opaque sparkle a real
          polished surface catches from a point light source. */}
      <Ellipse radiusX={3.2 * k} radiusY={2.2 * k} x={lightX * 0.7} y={lightY * 0.85} fill="white" opacity={0.9} />
    </Group>
  );
}
