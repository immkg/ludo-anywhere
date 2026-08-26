"use client";

import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Circle, Line, Star } from "react-konva";
import { buildBoardLayout, tokenPixelPosition, isSafeGlobalCell, RING_LEG_A, RING_LEG_BRIDGE } from "@/game/board";
import Token from "@/components/game/Token";
import type { GameState } from "@/types/game";

const INK = "#2B2016";
const CREAM = "#FFFDF6";
const BOARD_SIZE = 1000;

type BoardProps = {
  game: GameState;
  isMyTurn: boolean;
  currentSeatId: string | null;
  validMoves: number[];
  onTokenTap: (seatId: string, tokenIndex: number) => void;
};

function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    observer.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

function polarPoint(cx: number, cy: number, angleDeg: number, r: number) {
  const angle = (angleDeg * Math.PI) / 180;
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

// A rotated-rect spec for a "rail" running between two points, used to lay
// a wide track bed under the star board's path cells — its single-file
// diagonal interpolation needs a decorative width; the classic board's grid
// cells are already properly widthed and don't need this.
function railBetween(p1: { x: number; y: number }, p2: { x: number; y: number }, thickness: number) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy);
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
    width: length,
    height: thickness,
    offsetX: length / 2,
    offsetY: thickness / 2,
    rotation: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}

export default function Board({ game, isMyTurn, currentSeatId, validMoves, onTokenTap }: BoardProps) {
  const [containerRef, width] = useContainerWidth();
  const arms = game.arms;
  const layout = buildBoardLayout(arms);
  const activeArms = new Set(game.seats.map((s) => s.armIndex));
  const step = 360 / arms;
  // A classic 4-player board is rendered on the real rectilinear 15x15 grid
  // (straight runs, 90° turns, solid contiguous quadrants) — not a shape
  // stretched to also fit 5/6 players. Those get a true star: tapering
  // points with cream gaps between them, around a hexagonal ring.
  const isClassic = arms === 4;

  const pitch = Math.hypot(
    layout.ringCells[1].x - layout.ringCells[0].x,
    layout.ringCells[1].y - layout.ringCells[0].y
  );
  const CELL = pitch * 0.94;

  // Group tokens sharing (roughly) the same cell so they fan out instead of
  // fully overlapping.
  const placed = game.seats.flatMap((seat) =>
    seat.tokens.map((pos, tokenIndex) => {
      const { x, y } = tokenPixelPosition(seat.armIndex, pos, arms, tokenIndex);
      return { seat, pos, tokenIndex, x, y, key: `${seat.id}-${tokenIndex}` };
    })
  );
  const groups = new Map<string, typeof placed>();
  placed.forEach((t) => {
    const key = `${Math.round(t.x)}:${Math.round(t.y)}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  });

  const size = width || 1;
  const scale = size / BOARD_SIZE;

  // ---- classic board background/quadrants ----
  const gridMargin = CELL * 0.85;
  const gridMin = Math.min(...layout.arms.flatMap((a) => (a.block ? [a.block.x, a.block.y] : [])));
  const gridMax = Math.max(
    ...layout.arms.flatMap((a) => (a.block ? [a.block.x + a.block.width, a.block.y + a.block.height] : []))
  );

  // ---- star board background/points ----
  const boundaryPoints = layout.arms.flatMap((_, i) => {
    const angle = ((-90 + i * step + step / 2) * Math.PI) / 180;
    const r = 520;
    return [500 + r * Math.cos(angle), 500 + r * Math.sin(angle)];
  });

  return (
    <div ref={containerRef} className="w-full max-w-lg mx-auto aspect-square touch-none select-none">
      <Stage width={size} height={size} scaleX={scale} scaleY={scale}>
        <Layer>
          {isClassic ? (
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
          ) : (
            <Line
              points={boundaryPoints}
              closed
              fill={CREAM}
              stroke={INK}
              strokeWidth={8}
              lineJoin="round"
              shadowColor="black"
              shadowBlur={20}
              shadowOpacity={0.25}
              shadowOffset={{ x: 0, y: 6 }}
            />
          )}

          {/* Each arm's color: a solid contiguous quadrant for the classic
              board, or a tapering star point (with cream gaps between
              points) for a 5/6-player board. */}
          {isClassic
            ? layout.arms.map(
                (arm) =>
                  arm.block && (
                    <Rect
                      key={arm.color.id}
                      x={arm.block.x}
                      y={arm.block.y}
                      width={arm.block.width}
                      height={arm.block.height}
                      fill={arm.color.hex}
                      stroke={INK}
                      strokeWidth={2.5}
                      opacity={activeArms.has(arm.armIndex) ? 1 : 0.3}
                    />
                  )
              )
            : layout.arms.map((arm) => {
                const centerAngle = -90 + arm.armIndex * step + step / 2;
                const baseHalfAngle = step * 0.47;
                const [bx1, by1] = polarPoint(500, 500, centerAngle - baseHalfAngle, 225);
                const [bx2, by2] = polarPoint(500, 500, centerAngle + baseHalfAngle, 225);
                const [tx, ty] = polarPoint(500, 500, centerAngle, 490);
                return (
                  <Line
                    key={arm.color.id}
                    points={[bx1, by1, tx, ty, bx2, by2]}
                    closed
                    fill={arm.color.hex}
                    stroke={INK}
                    strokeWidth={2.5}
                    lineJoin="round"
                    opacity={activeArms.has(arm.armIndex) ? 1 : 0.3}
                  />
                );
              })}

          {/* the small colored "finish" pinwheel at dead center */}
          {isClassic
            ? layout.arms.map(
                (arm) =>
                  arm.pinwheel && (
                    <Line
                      key={`pin-${arm.color.id}`}
                      points={arm.pinwheel.flatMap((p) => [p.x, p.y])}
                      closed
                      fill={arm.color.hex}
                      stroke={INK}
                      strokeWidth={1.5}
                      opacity={activeArms.has(arm.armIndex) ? 1 : 0.3}
                    />
                  )
              )
            : <Circle x={500} y={500} radius={20} fill={CREAM} stroke={INK} strokeWidth={3} />}

          {/* track bed: only the star board needs a decorative wide road —
              the classic board's grid cells are already the right width.
              Three rails per arm (lean-in, corner bridge, lean-out) so the
              road follows the bent path instead of cutting a straight
              chord across the corner. */}
          {!isClassic &&
            layout.arms.flatMap((arm) => {
              const ringLen = layout.ringCells.length;
              const cellsPerArm = ringLen / arms;
              const base = arm.armIndex * cellsPerArm;
              const legAEnd = base + RING_LEG_A - 1;
              const legBStart = base + RING_LEG_A + RING_LEG_BRIDGE - 1;
              const nextStart = ((arm.armIndex + 1) * cellsPerArm) % ringLen;
              const at = (i: number) => layout.ringCells[i];
              return [
                <Rect key={`rail-a-${arm.armIndex}`} {...railBetween(at(base), at(legAEnd), CELL * 4.6)} fill={CREAM} stroke={INK} strokeWidth={1.5} />,
                <Rect key={`rail-c-${arm.armIndex}`} {...railBetween(at(legAEnd), at(legBStart), CELL * 4.6)} fill={CREAM} stroke={INK} strokeWidth={1.5} />,
                <Rect key={`rail-b-${arm.armIndex}`} {...railBetween(at(legBStart), at(nextStart), CELL * 4.6)} fill={CREAM} stroke={INK} strokeWidth={1.5} />,
              ];
            })}
          {!isClassic &&
            layout.arms.map((arm) => (
              <Rect
                key={`rail-home-${arm.armIndex}`}
                {...railBetween(arm.homeColumn[0], arm.homeColumn[arm.homeColumn.length - 1], CELL * 3.1)}
                fill={CREAM}
                stroke={INK}
                strokeWidth={1.5}
                opacity={activeArms.has(arm.armIndex) ? 1 : 0.35}
              />
            ))}

          {/* shared ring */}
          {layout.ringCells.map((cell) => {
            const startArm = layout.arms.find((a) => a.startGlobalIndex === cell.index) ?? null;
            return (
              <Rect
                key={cell.index}
                x={cell.x - CELL / 2}
                y={cell.y - CELL / 2}
                width={CELL}
                height={CELL}
                fill={startArm ? startArm.color.hex : CREAM}
                stroke={INK}
                strokeWidth={1.5}
              />
            );
          })}
          {layout.ringCells.map((cell) => {
            const safe = isSafeGlobalCell(cell.index, arms);
            const isStart = layout.arms.some((a) => a.startGlobalIndex === cell.index);
            if (!safe || isStart) return null;
            return (
              <Star
                key={`star-${cell.index}`}
                x={cell.x}
                y={cell.y}
                numPoints={5}
                innerRadius={3.4}
                outerRadius={8}
                fill="#D8A400"
                stroke={INK}
                strokeWidth={0.75}
              />
            );
          })}

          {/* home columns are a cream lane cut into the color, same as the
              ring — a same-colored lane would disappear against the color. */}
          {layout.arms.flatMap((arm) =>
            arm.homeColumn.map((cell, i) => (
              <Rect
                key={`home-${arm.armIndex}-${i}`}
                x={cell.x - CELL / 2}
                y={cell.y - CELL / 2}
                width={CELL}
                height={CELL}
                fill={CREAM}
                stroke={INK}
                strokeWidth={1.5}
                opacity={activeArms.has(arm.armIndex) ? 1 : 0.35}
              />
            ))
          )}

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

          {[...groups.values()].map((group) =>
            group.map((t, i) => {
              const spread = group.length > 1 ? 8 : 0;
              const offsetAngle = (i / group.length) * Math.PI * 2;
              const arm = layout.arms[t.seat.armIndex];
              const selectable = isMyTurn && t.seat.id === currentSeatId && validMoves.includes(t.tokenIndex);
              return (
                <Token
                  key={t.key}
                  x={t.x + Math.cos(offsetAngle) * spread}
                  y={t.y + Math.sin(offsetAngle) * spread}
                  color={arm.color.hex}
                  selectable={selectable}
                  onTap={() => onTokenTap(t.seat.id, t.tokenIndex)}
                />
              );
            })
          )}
        </Layer>
      </Stage>
    </div>
  );
}
