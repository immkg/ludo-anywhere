"use client";

import type Konva from "konva";
import { Circle, Ellipse, Group, Line } from "react-konva";
import { usePulse } from "@/hooks/useAnimatedPoint";
import { useSteppedToken } from "@/hooks/useSteppedToken";

const INK = "#2B2016";
const GOLD = "#FFD400";
const CREAM = "#FFFDF6";

// Every other measurement below is a fraction of this baseline (the
// design's original fixed 18px collar radius) — Board.tsx now passes the
// actual `radius` a token should render at (its outer, collar edge, sized
// to match the board's cell), and everything scales off that via `k`
// rather than staying pinned to the original absolute pixel values.
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
  const innerRadius = 15 * k;
  const defaultHitRadius = 27 * k;

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
      <Ellipse radiusX={10 * k} radiusY={3.5 * k} y={8 * k} fill={INK} opacity={0.25} />
      <Circle
        radius={collarRadius}
        fill={CREAM}
        stroke={selectable ? GOLD : INK}
        strokeWidth={(selectable ? 3 : 2) * k}
        shadowColor="black"
        shadowBlur={5 * k}
        shadowOffset={{ x: 0, y: 3 * k }}
        shadowOpacity={0.35}
      />
      <Circle
        radius={innerRadius}
        fillRadialGradientStartPoint={{ x: -4 * k, y: -5 * k }}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndPoint={{ x: -2 * k, y: -3 * k }}
        fillRadialGradientEndRadius={18 * k}
        fillRadialGradientColorStops={[0, "#ffffff", 0.25, color, 1, color]}
        stroke={INK}
        strokeWidth={2 * k}
      />
      <Circle radius={6.5 * k} y={-1 * k} fill={color} stroke={INK} strokeWidth={1.5 * k} />
      <Ellipse radiusX={3.5 * k} radiusY={2.5 * k} x={-4 * k} y={-5 * k} fill="white" opacity={0.8} />
    </Group>
  );
}
