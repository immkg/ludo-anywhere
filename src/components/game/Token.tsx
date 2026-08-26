"use client";

import { Circle, Ellipse, Group } from "react-konva";
import { useAnimatedPoint, usePulse } from "@/hooks/useAnimatedPoint";

const INK = "#2B2016";

type TokenProps = {
  x: number;
  y: number;
  color: string;
  selectable: boolean;
  onTap?: () => void;
};

export default function Token({ x, y, color, selectable, onTap }: TokenProps) {
  const { x: px, y: py } = useAnimatedPoint(x, y);
  const haloRadius = usePulse(selectable);

  return (
    <Group x={px} y={py} onClick={onTap} onTap={onTap} listening={selectable}>
      {selectable && <Circle radius={haloRadius} fill={color} opacity={0.4} />}
      <Ellipse radiusX={9} radiusY={3} y={7} fill={INK} opacity={0.25} />
      <Circle
        radius={13}
        fillRadialGradientStartPoint={{ x: -4, y: -5 }}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndPoint={{ x: -2, y: -3 }}
        fillRadialGradientEndRadius={16}
        fillRadialGradientColorStops={[0, "#ffffff", 0.25, color, 1, color]}
        stroke={INK}
        strokeWidth={2.5}
        shadowColor="black"
        shadowBlur={5}
        shadowOffset={{ x: 0, y: 3 }}
        shadowOpacity={0.35}
      />
      <Circle radius={5.5} y={-1} fill={color} stroke={INK} strokeWidth={1.5} />
      <Ellipse radiusX={3} radiusY={2} x={-3.5} y={-4.5} fill="white" opacity={0.8} />
    </Group>
  );
}
