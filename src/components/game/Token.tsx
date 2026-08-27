"use client";

import type Konva from "konva";
import { Circle, Ellipse, Group, Line } from "react-konva";
import { usePulse } from "@/hooks/useAnimatedPoint";
import { useSteppedToken } from "@/hooks/useSteppedToken";

const INK = "#2B2016";
const GOLD = "#FFD400";
const CREAM = "#FFFDF6";

// Visible token radius. Kept separate from the hit-area sizing below so the
// tap target can be generous without the piece itself looking oversized.
const RADIUS = 15;
// A cream "collar" drawn around the token, wider than its own fill. A
// token's fill is the same hue as its home yard/column, so on those cells
// the ink outline alone was too thin to keep it from blending in — this
// gives every token a light ring that reads against any arm color.
const COLLAR_RADIUS = RADIUS + 3;
// Invisible hit-area floor/ceiling — bigger than the drawn token so it's
// easy to tap on a phone. Board.tsx builds each selectable token's actual
// hit shape as a Voronoi-style territory (see src/lib/hitTerritory.ts):
// the largest area around it that stays closer to it than to any other
// selectable token, clamped to this floor/ceiling and to the board edge.
// Exported so Board's territory math always matches what this component
// will actually render.
export const MIN_HIT_RADIUS = COLLAR_RADIUS;
export const MAX_HIT_RADIUS = 46;
const DEFAULT_HIT_RADIUS = 27;

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
        <Circle radius={DEFAULT_HIT_RADIUS} fill={color} opacity={0} />
      )}
      <Ellipse radiusX={10} radiusY={3.5} y={8} fill={INK} opacity={0.25} />
      <Circle
        radius={COLLAR_RADIUS}
        fill={CREAM}
        stroke={selectable ? GOLD : INK}
        strokeWidth={selectable ? 3 : 2}
        shadowColor="black"
        shadowBlur={5}
        shadowOffset={{ x: 0, y: 3 }}
        shadowOpacity={0.35}
      />
      <Circle
        radius={RADIUS}
        fillRadialGradientStartPoint={{ x: -4, y: -5 }}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndPoint={{ x: -2, y: -3 }}
        fillRadialGradientEndRadius={18}
        fillRadialGradientColorStops={[0, "#ffffff", 0.25, color, 1, color]}
        stroke={INK}
        strokeWidth={2}
      />
      <Circle radius={6.5} y={-1} fill={color} stroke={INK} strokeWidth={1.5} />
      <Ellipse radiusX={3.5} radiusY={2.5} x={-4} y={-5} fill="white" opacity={0.8} />
    </Group>
  );
}
