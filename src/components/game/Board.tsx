"use client";

import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Circle, Line, Star, Group, Path, Text } from "react-konva";
import { buildBoardLayout, tokenPixelPosition, isSafeGlobalCell, finished as finishedPos, YARD } from "@/game/board";
import { placementFor } from "@/game/engine";
import Token from "@/components/game/Token";
import { STEP_MS } from "@/hooks/useSteppedToken";
import { voronoiTerritory } from "@/lib/hitTerritory";
import { useCosmetics } from "@/components/CosmeticsProvider";
import { resolveBoardFinishFill } from "@/game/cosmetics";
import type { GameState } from "@/types/game";

const INK = "#000000";
const CREAM = "#FFFDF6";
const GOLD = "#FFD400";
const GOLD_DARK = "#C99A00";
const BOARD_SIZE = 1000;
// Same silhouette as PlayerCorner's crown badge, in a 0..24 x 0..22 local
// box — kept here rather than shared, since one's plain SVG (a DOM
// component) and this one's a Konva shape on the board's canvas.
const CROWN_PATH = "M2,18 L2,9 L7,13 L12,4 L17,13 L22,9 L22,18 Z";

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

const FINISH_LINE = finishedPos();

// The "weave" board finish's diagonal-hatch pattern tile — generated on a
// small offscreen canvas rather than a shipped image asset, and cached per
// arm color (there are only ever 4) so it's built once, not once per
// render. Konva accepts a canvas directly as fillPatternImage. This file is
// dynamic-imported with ssr:false (see GameView.tsx, Konva needs a real
// canvas/window), so `document` is always available by the time this runs.
const weavePatternCache = new Map<string, HTMLCanvasElement>();
function weavePatternCanvas(hex: string): HTMLCanvasElement | undefined {
  const cached = weavePatternCache.get(hex);
  if (cached) return cached;
  const size = 24;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(255,255,255,0.32)";
  ctx.lineWidth = 2.5;
  // One diagonal stroke through the tile, plus its two wrap-around slivers
  // (top-left and bottom-right corners), so the hatch reads as a single
  // continuous diagonal once the tile repeats rather than a chevron.
  ctx.beginPath();
  ctx.moveTo(0, size);
  ctx.lineTo(size, 0);
  ctx.moveTo(-size * 0.3, size * 0.3);
  ctx.lineTo(size * 0.3, -size * 0.3);
  ctx.moveTo(size * 0.7, size * 1.3);
  ctx.lineTo(size * 1.3, size * 0.7);
  ctx.stroke();
  weavePatternCache.set(hex, canvas);
  return canvas;
}

// The one token that just moved forward this turn (a captured token also
// changes, but only ever backward to the yard, so it's excluded here) — the
// same move used to compute both the capture-retreat delay and which home
// arrival gets the finish/victory sound.
function findMover(prevGame: GameState, game: GameState) {
  for (const prevSeat of prevGame.seats) {
    const seat = game.seats.find((s) => s.id === prevSeat.id);
    if (!seat) continue;
    for (let tokenIndex = 0; tokenIndex < prevSeat.tokens.length; tokenIndex++) {
      const from = prevSeat.tokens[tokenIndex];
      const to = seat.tokens[tokenIndex];
      if (from === to || to === YARD) continue;
      const hops = from === YARD ? 0 : to - from;
      return { seatId: seat.id, tokenIndex, to, hops };
    }
  }
  return null;
}

type MoveEffects = { captureDelayByKey: Map<string, number>; finishSoundByKey: Map<string, "chime" | "victory"> };

function computeMoveEffects(prevGame: GameState, game: GameState): MoveEffects {
  const captureDelayByKey = new Map<string, number>();
  const finishSoundByKey = new Map<string, "chime" | "victory">();

  const mover = findMover(prevGame, game);
  if (!mover) return { captureDelayByKey, finishSoundByKey };

  // Entering from the yard (hops === 0) never captures — the start cell
  // is always safe — so only a forward hop along the ring can.
  if (mover.hops > 0) {
    const delayMs = mover.hops * STEP_MS;
    game.seats.forEach((seat) => {
      if (seat.id === mover.seatId) return;
      const prevSeat = prevGame.seats.find((s) => s.id === seat.id);
      if (!prevSeat) return;
      seat.tokens.forEach((pos, tokenIndex) => {
        const wasOnRing = prevSeat.tokens[tokenIndex] !== YARD;
        if (wasOnRing && pos === YARD) captureDelayByKey.set(`${seat.id}-${tokenIndex}`, delayMs);
      });
    });
  }

  if (mover.to === FINISH_LINE) {
    const justWon = game.placements.includes(mover.seatId) && !prevGame.placements.includes(mover.seatId);
    finishSoundByKey.set(`${mover.seatId}-${mover.tokenIndex}`, justWon ? "victory" : "chime");
  }

  return { captureDelayByKey, finishSoundByKey };
}

const EMPTY_MOVE_EFFECTS: MoveEffects = { captureDelayByKey: new Map(), finishSoundByKey: new Map() };

// Tracks the previous `game` purely to diff against the new one. Uses
// React's sanctioned "adjust state during render" pattern (a plain state
// compare-and-set, bailing out once already caught up) rather than a ref —
// a ref's `.current` can't be read during render (see the
// react-hooks/refs lint rule), and this needs the freshly computed maps
// ready in time for this same render's Tokens, not a render late.
function useMoveEffects(game: GameState) {
  const [prevGame, setPrevGame] = useState(game);
  const [effects, setEffects] = useState(EMPTY_MOVE_EFFECTS);

  if (game !== prevGame) {
    const next = computeMoveEffects(prevGame, game);
    setPrevGame(game);
    setEffects(next);
    return next;
  }

  return effects;
}

export default function Board({ game, isMyTurn, currentSeatId, validMoves, onTokenTap }: BoardProps) {
  const [containerRef, containerSize] = useContainerSize();
  const layout = buildBoardLayout();
  const { captureDelayByKey, finishSoundByKey } = useMoveEffects(game);
  // Each player's own free local pick — see src/game/cosmetics.ts and
  // CosmeticsProvider.tsx. Purely visual on this client; never synced
  // between players, same as ThemeProvider's dark/light.
  const { boardFinish } = useCosmetics();

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

          {/* each arm's quadrant — always fully colored, whether or not
              that arm has a seated player (2p/3p games leave some arms
              empty), so the board looks the same regardless of player
              count. Flat/gradient/pattern comes from the viewer's own free
              board-finish pick (see resolveBoardFinishFill) — genuinely
              per-client, never synced between players. */}
          {layout.arms.map((arm) => {
            const fill = resolveBoardFinishFill(boardFinish, arm.color.hex, arm.block.width, arm.block.height);
            return (
              <Rect
                key={arm.color.id}
                x={arm.block.x}
                y={arm.block.y}
                width={arm.block.width}
                height={arm.block.height}
                fill={fill.kind === "gradient" ? undefined : fill.fill}
                fillPriority={fill.kind === "weave" ? "pattern" : undefined}
                // Konva accepts an HTMLCanvasElement here at runtime (see
                // Konva.Shape's own GetSet typing), but react-konva's Rect
                // props narrow this to HTMLImageElement only — a type-def
                // gap, not a real runtime restriction.
                fillPatternImage={fill.kind === "weave" ? (weavePatternCanvas(fill.fill) as unknown as HTMLImageElement) : undefined}
                fillPatternRepeat={fill.kind === "weave" ? "repeat" : undefined}
                fillLinearGradientStartPoint={fill.kind === "gradient" ? fill.fillLinearGradientStartPoint : undefined}
                fillLinearGradientEndPoint={fill.kind === "gradient" ? fill.fillLinearGradientEndPoint : undefined}
                fillLinearGradientColorStops={
                  fill.kind === "gradient" ? fill.fillLinearGradientColorStops : undefined
                }
                stroke={INK}
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
          {layout.arms.map((arm) => (
            <Line
              key={`pin-${arm.color.id}`}
              points={arm.pinwheel.flatMap((p) => [p.x, p.y])}
              closed
              fill={arm.color.hex}
              stroke={INK}
              strokeWidth={1.5}
            />
          ))}

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
                captureDelayMs={captureDelayByKey.get(t.key)}
                finishSound={finishSoundByKey.get(t.key)}
                onTap={() => onTokenTap(t.seat.id, t.tokenIndex)}
              />
            );
          })}
        </Layer>
      </Stage>
    </div>
  );
}
