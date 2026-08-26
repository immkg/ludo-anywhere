export const TOKENS_PER_SEAT: number;
export const YARD: number;

export type ArmColor = { id: string; label: string; hex: string };

export function armForSeatIndex(seatIndex: number, totalPlayers: number): number;
export function colorForArm(armIndex: number): ArmColor;
export function trackSteps(): number;
export function finished(): number;
export function relativeToGlobalRing(armIndex: number, relPos: number): number | null;
export function isSafeGlobalCell(globalIndex: number): boolean;
export function isSafeRelativeCell(armIndex: number, relPos: number): boolean;

export type Point = { x: number; y: number };
export type RingCell = Point & { index: number };
export type HomeColumnCell = Point & { relPos: number };
export type YardSlot = Point & { slot: number };
export type ArmBlock = { x: number; y: number; width: number; height: number };
export type ArmLayout = {
  armIndex: number;
  color: ArmColor;
  startGlobalIndex: number;
  homeColumn: HomeColumnCell[];
  yardSlots: YardSlot[];
  // This arm's solid-color quadrant, the white inset "cage" square (with a
  // ~1-cell colored border) where its waiting tokens sit, and its wedge of
  // the small center "finish" pinwheel (3 points).
  block: ArmBlock;
  cage: ArmBlock;
  pinwheel: Point[];
};
export type BoardLayout = {
  viewBox: number;
  center: Point;
  ringCells: RingCell[];
  arms: ArmLayout[];
};

export function buildBoardLayout(): BoardLayout;
export function tokenPixelPosition(armIndex: number, relPos: number, tokenIndex?: number): Point;
