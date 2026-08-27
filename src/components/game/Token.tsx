"use client";

import type Konva from "konva";
import { Circle, Ellipse, Group } from "react-konva";
import { usePulse } from "@/hooks/useAnimatedPoint";
import { useSteppedToken } from "@/hooks/useSteppedToken";

const INK = "#2B2016";
const GOLD = "#FFD400";
const CREAM = "#FFFDF6";

// Visible token radius. Kept separate from HIT_RADIUS below so the tap
// target can be generous without the piece itself looking oversized.
const RADIUS = 15;
// A cream "collar" drawn around the token, wider than its own fill. A
// token's fill is the same hue as its home yard/column, so on those cells
// the ink outline alone was too thin to keep it from blending in — this
// gives every token a light ring that reads against any arm color.
const COLLAR_RADIUS = RADIUS + 3;
// Invisible hit-area radius — bigger than the drawn token so it's easy to
// tap on a phone. Stays under half the ring-cell pitch (~26 board units)
// so neighboring cells' tokens don't steal each other's taps.
const HIT_RADIUS = 24;

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
  onTap,
}: TokenProps) {
  const { x: rawX, y: rawY } = useSteppedToken(armIndex, pos, tokenIndex);
  const px = rawX + offsetX;
  const py = rawY + offsetY;
  const haloRadius = usePulse(selectable, 20, 28);

  return (
    <Group
      x={px}
      y={py}
      onClick={onTap}
      onTap={onTap}
      onMouseEnter={(e) => selectable && setCursor(e, "pointer")}
      onMouseLeave={(e) => selectable && setCursor(e, "default")}
      listening={selectable}
    >
      {/* Bigger-than-the-token, invisible hit area — Konva still hit-tests
          a shape with opacity 0 as long as it has a fill, so this widens
          the tap target without changing what's drawn. */}
      <Circle radius={HIT_RADIUS} fill={color} opacity={0} />
      {selectable && (
        <>
          {/* high-contrast ring so "movable" reads even against a
              same-hued board quadrant, not just the token's own glow */}
          <Circle radius={haloRadius} stroke={GOLD} strokeWidth={2.5} opacity={0.9} />
          <Circle radius={haloRadius * 0.8} fill={color} opacity={0.3} />
        </>
      )}
      <Ellipse radiusX={10} radiusY={3.5} y={8} fill={INK} opacity={0.25} />
      <Circle
        radius={COLLAR_RADIUS}
        fill={CREAM}
        stroke={INK}
        strokeWidth={2}
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
