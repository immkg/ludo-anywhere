"use client";

import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Circle, Line, Star } from "react-konva";
import { buildBoardLayout, tokenPixelPosition, isSafeGlobalCell } from "@/game/board";
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

export default function Board({ game, isMyTurn, currentSeatId, validMoves, onTokenTap }: BoardProps) {
  const [containerRef, width] = useContainerWidth();
  const layout = buildBoardLayout();
  const activeArms = new Set(game.seats.map((s) => s.armIndex));

  const pitch = Math.hypot(
    layout.ringCells[1].x - layout.ringCells[0].x,
    layout.ringCells[1].y - layout.ringCells[0].y
  );
  const CELL = pitch * 0.94;

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

  const size = width || 1;
  const scale = size / BOARD_SIZE;

  const gridMargin = CELL * 0.85;
  const gridMin = Math.min(...layout.arms.flatMap((a) => [a.block.x, a.block.y]));
  const gridMax = Math.max(...layout.arms.flatMap((a) => [a.block.x + a.block.width, a.block.y + a.block.height]));

  return (
    <div ref={containerRef} className="w-full max-w-lg mx-auto aspect-square touch-none select-none">
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
          {layout.arms.map((arm) => (
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
          ))}

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

          {/* the small colored "finish" pinwheel at dead center */}
          {layout.arms.map((arm) => (
            <Line
              key={`pin-${arm.color.id}`}
              points={arm.pinwheel.flatMap((p) => [p.x, p.y])}
              closed
              fill={arm.color.hex}
              stroke={INK}
              strokeWidth={1.5}
              opacity={activeArms.has(arm.armIndex) ? 1 : 0.3}
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
              white shared ring. */}
          {layout.arms.flatMap((arm) =>
            arm.homeColumn.map((cell, i) => (
              <Rect
                key={`home-${arm.armIndex}-${i}`}
                x={cell.x - CELL / 2}
                y={cell.y - CELL / 2}
                width={CELL}
                height={CELL}
                fill={arm.color.hex}
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
