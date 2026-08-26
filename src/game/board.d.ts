export const CELLS_PER_ARM: number;
export const HOME_STEPS: number;
export const TOKENS_PER_SEAT: number;
export const YARD: number;
export const RING_LEG_A: number;
export const RING_LEG_BRIDGE: number;

export type ArmColor = { id: string; label: string; hex: string };
export const ARM_COLORS: ArmColor[];

export function armsForPlayerCount(totalPlayers: number): number;
export function armForSeatIndex(seatIndex: number, totalPlayers: number): number;
export function colorForArm(armIndex: number): ArmColor;
export function ringLength(arms: number): number;
export function trackSteps(arms: number): number;
export function homeStart(arms: number): number;
export function finished(arms: number): number;
export function startOffset(armIndex: number): number;
export function relativeToGlobalRing(armIndex: number, relPos: number, arms: number): number | null;
export function isSafeGlobalCell(globalIndex: number, arms: number): boolean;
export function isSafeRelativeCell(armIndex: number, relPos: number, arms: number): boolean;

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
  // Only set for the classic 4-arm board: this arm's solid-color quadrant,
  // and its wedge of the small center "finish" pinwheel (3 points).
  block?: ArmBlock;
  pinwheel?: Point[];
};
export type BoardLayout = {
  viewBox: number;
  center: Point;
  ringCells: RingCell[];
  arms: ArmLayout[];
};

export function buildBoardLayout(arms: number): BoardLayout;
export function tokenPixelPosition(armIndex: number, relPos: number, arms: number, tokenIndex?: number): Point;
