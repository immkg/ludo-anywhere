"use client";

import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Circle, Line, Star, Group, Path, Text } from "react-konva";
import { buildBoardLayout, tokenPixelPosition, isSafeGlobalCell } from "@/game/board";
import { placementFor } from "@/game/engine";
import Token from "@/components/game/Token";
import { voronoiTerritory } from "@/lib/hitTerritory";
import type { GameState } from "@/types/game";

const INK = "#2B2016";
const CREAM = "#FFFDF6";
const GOLD = "#FFD400";
const GOLD_DARK = "#C99A00";
const BOARD_SIZE = 1000;
// Same silhouette as PlayerCorner's crown badge, in a 0..24 x 0..22 local
// box — kept here rather than shared, since one's plain SVG (a DOM
// component) and this one's a Konva shape on the board's canvas.
const CROWN_PATH = "M2,18 L2,9 L7,13 L12,4 L17,13 L22,9 L22,18 Z";

// Inactive arms fade their color toward CREAM. Blocks, home columns, and
// the center pinwheel all reach into the shared middle cross of the grid,
// where an inactive arm's shape can sit directly on top of an active
// neighbor's opaque color (e.g. arm 1's home column runs down the same
// grid column arm 0's block fills). Faking the fade with plain Konva
// `opacity` blends against whatever was painted underneath instead of a
// neutral base, so the neighbor's color bleeds through as mud. Baking the
// fade into a solid, opaque color up front keeps the result the same
// regardless of paint order.
function faded(hex: string, amount: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const base = { r: 255, g: 253, b: 246 }; // CREAM
  const mix = (channel: number, baseChannel: number) => Math.round(channel * amount + baseChannel * (1 - amount));
  return `rgb(${mix(r, base.r)}, ${mix(g, base.g)}, ${mix(b, base.b)})`;
}

type BoardProps = {
  game: GameState;
  isMyTurn: boolean;
  currentSeatId: string | null;
  validMoves: number[];
  onTokenTap: (seatId: string, tokenIndex: number) => void;
};

// Measures both dimensions (not just width) because the board's container
// isn't always wider than it is tall — on a short/landscape viewport the
// available height is the tighter constraint. The Stage below is always
// square, so sizing it off width alone would let it overflow the container
// vertically whenever height is the binding side.
function useContainerSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    observer.observe(el);
    const rect = el.getBoundingClientRect();
    setSize({ width: rect.width, height: rect.height });
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

export default function Board({ game, isMyTurn, currentSeatId, validMoves, onTokenTap }: BoardProps) {
  const [containerRef, containerSize] = useContainerSize();
  const layout = buildBoardLayout();
  const activeArms = new Set(game.seats.map((s) => s.armIndex));

  const pitch = Math.hypot(
    layout.ringCells[1].x - layout.ringCells[0].x,
    layout.ringCells[1].y - layout.ringCells[0].y
  );
  const CELL = pitch * 0.94;
  // A token's diameter matches a cell's — see Token.tsx, which scales its
  // whole design off this outer (collar) radius. Everything that used to
  // be sized relative to the old fixed token radius (the tap-target
  // ceiling, the fan-out spread below) scales with it too, at the same
  // ratio the original fixed pixel values had to the original fixed
  // 18px collar radius.
  const TOKEN_RADIUS = CELL / 2;
  const MIN_HIT_RADIUS = TOKEN_RADIUS;
  const MAX_HIT_RADIUS = TOKEN_RADIUS * (46 / 18);

  // Group tokens sharing (roughly) the same cell so they fan out instead of
  // fully overlapping.
  const placed = game.seats.flatMap((seat) =>
    seat.tokens.map((pos, tokenIndex) => {
      const { x, y } = tokenPixelPosition(seat.armIndex, pos, tokenIndex);
      return { seat, pos, tokenIndex, x, y, key: `${seat.id}-${tokenIndex}` };
    })
  );
  const groups = new Map<string, typeof placed>();
  placed.forEach((t) => {
    const key = `${Math.round(t.x)}:${Math.round(t.y)}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  });
  // Each token's fan-out offset, looked up by its own stable key rather than
  // rendered via a nested per-group map — a nested `.map` inside `.map`
  // leaves the outer array without keys, so React keys each Token by its
  // (group position, token key) pair instead of just the token key. Since
  // group membership/order reshuffles constantly as tokens move (especially
  // around safe cells, where tokens stack and unstack most), that silently
  // remounts the Token and resets its in-flight step animation mid-hop.
  const spreadByKey = new Map<string, { offsetX: number; offsetY: number }>();
  groups.forEach((group) => {
    const spread = group.length > 1 ? TOKEN_RADIUS * (8 / 18) : 0;
    group.forEach((t, i) => {
      const offsetAngle = (i / group.length) * Math.PI * 2;
      spreadByKey.set(t.key, { offsetX: Math.cos(offsetAngle) * spread, offsetY: Math.sin(offsetAngle) * spread });
    });
  });

  const size = Math.min(containerSize.width, containerSize.height) || 1;
  const scale = size / BOARD_SIZE;

  const gridMargin = CELL * 0.85;
  const gridMin = Math.min(...layout.arms.flatMap((a) => [a.block.x, a.block.y]));
  const gridMax = Math.max(...layout.arms.flatMap((a) => [a.block.x + a.block.width, a.block.y + a.block.height]));
  const boardBounds = {
    left: gridMin - gridMargin,
    right: gridMax + gridMargin,
    top: gridMin - gridMargin,
    bottom: gridMax + gridMargin,
  };

  // Only selectable tokens actually listen for taps (see Token's
  // `listening={selectable}`), so a selectable token's tap target only ever
  // needs to steer clear of *other selectable* tokens' territories —
  // everything else is invisible to Konva's hit test regardless of overlap.
  // Each one gets the largest area that's still closer to it than to any
  // other legal-move chip (a Voronoi cell), capped by an outer reach and
  // the board edge — see src/lib/hitTerritory.ts for the geometry. A chip
  // off on its own claims far more room than one boxed in by neighbors, and
  // unevenly so: it reaches further specifically toward whichever side is
  // actually open.
  const selectablePoints = placed
    .filter((t) => isMyTurn && t.seat.id === currentSeatId && validMoves.includes(t.tokenIndex))
    .map((t) => {
      const { offsetX, offsetY } = spreadByKey.get(t.key)!;
      return { key: t.key, x: t.x + offsetX, y: t.y + offsetY };
    });
  const hitPointsByKey = new Map<string, number[]>();
  selectablePoints.forEach((point) => {
    const others = selectablePoints.filter((other) => other.key !== point.key);
    const territory = voronoiTerritory(point, others, {
      minRadius: MIN_HIT_RADIUS,
      maxRadius: MAX_HIT_RADIUS,
      bounds: boardBounds,
    });
    // Local space, relative to the token's own center — Token renders this
    // inside a Group already positioned at (point.x, point.y).
    hitPointsByKey.set(
      point.key,
      territory.flatMap((p) => [p.x - point.x, p.y - point.y])
    );
  });

  return (
    <div ref={containerRef} className="flex h-full w-full items-center justify-center touch-none select-none">
      <Stage width={size} height={size} scaleX={scale} scaleY={scale}>
        <Layer>
          <Rect
            x={gridMin - gridMargin}
            y={gridMin - gridMargin}
            width={gridMax - gridMin + gridMargin * 2}
            height={gridMax - gridMin + gridMargin * 2}
            cornerRadius={16}
            fill={CREAM}
            stroke={INK}
            strokeWidth={8}
            shadowColor="black"
            shadowBlur={20}
            shadowOpacity={0.25}
            shadowOffset={{ x: 0, y: 6 }}
          />

          {/* each arm's solid-color quadrant */}
          {layout.arms.map((arm) => {
            const active = activeArms.has(arm.armIndex);
            return (
              <Rect
                key={arm.color.id}
                x={arm.block.x}
                y={arm.block.y}
                width={arm.block.width}
                height={arm.block.height}
                fill={active ? arm.color.hex : faded(arm.color.hex, 0.3)}
                stroke={active ? INK : faded(INK, 0.3)}
                strokeWidth={2.5}
              />
            );
          })}

          {/* the "cage": a white inset square with a ~1-cell colored
              border, where each arm's 4 waiting tokens sit — matches a
              real board's yard box instead of a solid color patch. */}
          {layout.arms.map((arm) => (
            <Rect
              key={`cage-${arm.armIndex}`}
              x={arm.cage.x}
              y={arm.cage.y}
              width={arm.cage.width}
              height={arm.cage.height}
              cornerRadius={10}
              fill={CREAM}
              stroke={INK}
              strokeWidth={2}
              opacity={activeArms.has(arm.armIndex) ? 1 : 0.35}
            />
          ))}

          {/* shared ring — a start cell only carries its arm's color when
              that arm is actually in play (2p/3p leaves some arms empty);
              otherwise it fades the same way the block/home column do,
              instead of standing out as one leftover bright cell. */}
          {layout.ringCells.map((cell) => {
            const startArm = layout.arms.find((a) => a.startGlobalIndex === cell.index) ?? null;
            const active = startArm && activeArms.has(startArm.armIndex);
            return (
              <Rect
                key={cell.index}
                x={cell.x - CELL / 2}
                y={cell.y - CELL / 2}
                width={CELL}
                height={CELL}
                fill={!startArm ? CREAM : active ? startArm.color.hex : faded(startArm.color.hex, 0.3)}
                stroke={INK}
                strokeWidth={1.5}
              />
            );
          })}
          {layout.ringCells.map((cell) => {
            const safe = isSafeGlobalCell(cell.index);
            const isStart = layout.arms.some((a) => a.startGlobalIndex === cell.index);
            if (!safe || isStart) return null;
            return (
              <Star
                key={`star-${cell.index}`}
                x={cell.x}
                y={cell.y}
                numPoints={5}
                innerRadius={CELL * 0.15}
                outerRadius={CELL * 0.34}
                fill="#D8A400"
                stroke={INK}
                strokeWidth={1.5}
              />
            );
          })}

          {/* home column: each arm's final track into the center, colored
              like a real board so it reads as "your lane" against the
              white shared ring. When an arm is inactive its cells drop
              the per-cell ink border — at reduced opacity, adjoining
              borders double up into a muddy grid line, so a borderless
              tile reads as a clean flat tint instead. */}
          {layout.arms.flatMap((arm) => {
            const active = activeArms.has(arm.armIndex);
            return arm.homeColumn.map((cell, i) => (
              <Rect
                key={`home-${arm.armIndex}-${i}`}
                x={cell.x - CELL / 2}
                y={cell.y - CELL / 2}
                width={CELL}
                height={CELL}
                fill={active ? arm.color.hex : faded(arm.color.hex, 0.35)}
                stroke={active ? INK : undefined}
                strokeWidth={active ? 1.5 : 0}
              />
            ));
          })}

          {/* yard: token wells sit directly on the color, like a real
              board — no separate white tray behind them. */}
          {layout.arms.flatMap((arm) =>
            arm.yardSlots.map((slot) => (
              <Circle
                key={`slot-${arm.armIndex}-${slot.slot}`}
                x={slot.x}
                y={slot.y}
                radius={22}
                fill="rgba(255,255,255,0.3)"
                stroke={INK}
                strokeWidth={1.5}
                opacity={activeArms.has(arm.armIndex) ? 1 : 0.35}
              />
            ))
          )}

          {/* A finished seat's tokens have all moved to the center, so
              their yard sits empty — a big crown fills it, right where
              their tokens started, instead of the small PlayerCorner
              badge being the only sign they finished. */}
          {layout.arms.map((arm) => {
            const seatId = game.seats.find((s) => s.armIndex === arm.armIndex)?.id;
            const placement = seatId ? placementFor(game, seatId) : null;
            if (!placement || placement > 3) return null;

            const crownWidth = arm.cage.width * 0.72;
            const s = crownWidth / 24;
            const cx = arm.cage.x + arm.cage.width / 2;
            const cy = arm.cage.y + arm.cage.height / 2;

            return (
              <Group key={`crown-${arm.armIndex}`} x={cx - 12 * s} y={cy - 11 * s} scaleX={s} scaleY={s} listening={false}>
                <Path
                  data={CROWN_PATH}
                  fill={GOLD}
                  stroke={GOLD_DARK}
                  strokeWidth={1.5}
                  shadowColor="black"
                  shadowBlur={3}
                  shadowOpacity={0.35}
                  shadowOffset={{ x: 0, y: 1.5 }}
                />
                <Circle x={2} y={9} radius={1.6} fill={GOLD_DARK} />
                <Circle x={12} y={4} radius={1.8} fill={GOLD_DARK} />
                <Circle x={22} y={9} radius={1.6} fill={GOLD_DARK} />
                <Circle x={12} y={20} radius={4.5} fill={INK} />
                <Text
                  text={String(placement)}
                  x={12 - 3}
                  y={20 - 3.5}
                  width={6}
                  align="center"
                  fontSize={6}
                  fontStyle="bold"
                  fill={CREAM}
                />
              </Group>
            );
          })}

          {/* the small colored "finish" pinwheel at dead center — drawn on
              top of the ring/home cells so its clean triangles cover the
              hub instead of the home column's individually-bordered end
              cells showing through as a grid. */}
          {layout.arms.map((arm) => {
            const active = activeArms.has(arm.armIndex);
            return (
              <Line
                key={`pin-${arm.color.id}`}
                points={arm.pinwheel.flatMap((p) => [p.x, p.y])}
                closed
                fill={active ? arm.color.hex : faded(arm.color.hex, 0.3)}
                stroke={active ? INK : faded(INK, 0.3)}
                strokeWidth={1.5}
              />
            );
          })}

          {placed.map((t) => {
            const { offsetX, offsetY } = spreadByKey.get(t.key)!;
            const arm = layout.arms[t.seat.armIndex];
            const selectable = isMyTurn && t.seat.id === currentSeatId && validMoves.includes(t.tokenIndex);
            return (
              <Token
                key={t.key}
                armIndex={t.seat.armIndex}
                pos={t.pos}
                tokenIndex={t.tokenIndex}
                offsetX={offsetX}
                offsetY={offsetY}
                color={arm.color.hex}
                selectable={selectable}
                radius={TOKEN_RADIUS}
                hitPoints={hitPointsByKey.get(t.key)}
                onTap={() => onTokenTap(t.seat.id, t.tokenIndex)}
              />
            );
          })}
        </Layer>
      </Stage>
    </div>
  );
}
