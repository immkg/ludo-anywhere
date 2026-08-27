// Ludo board geometry and cell classification for the classic 4-player
// board: a shared 52-cell ring (13 cells per arm), each arm owning a
// 6-cell home column that cuts from the ring inward to the center, and a
// 4-slot yard where its tokens wait before entering.
//
// Token position is a single relative integer per arm:
//   -1     -> in the yard, not yet on the board
//   0..50  -> the 52 shared ring cells that make up one full lap
//   51..56 -> the 6 home-column cells (last one = finished)

const ARMS = 4;
const CELLS_PER_ARM = 13;
const RING_LENGTH = ARMS * CELLS_PER_ARM;
const HOME_STEPS = 6;
export const TOKENS_PER_SEAT = 4;
export const YARD = -1;

// Bright, saturated "toy" colors to match a traditional physical Ludo board.
const ARM_COLORS = [
  { id: "red", label: "Red", hex: "#E8262C" },
  { id: "green", label: "Green", hex: "#1F9E4C" },
  { id: "yellow", label: "Yellow", hex: "#FFCC00" },
  { id: "blue", label: "Blue", hex: "#1565E8" },
];

// Deterministic seat -> arm assignment so a partially-filled board blanks
// out symmetrically (2p = opposite corners, 3p = one corner blank) instead
// of depending on which arm a player happens to pick.
export function armForSeatIndex(seatIndex, totalPlayers) {
  return Math.floor((seatIndex * ARMS) / totalPlayers);
}

export function colorForArm(armIndex) {
  return ARM_COLORS[armIndex];
}

// Relative position where a token turns off the shared ring into its own
// home column, and the final "finished" position.
export function trackSteps() {
  return RING_LENGTH - 1;
}

function homeStart() {
  return trackSteps();
}

export function finished() {
  return homeStart() + HOME_STEPS - 1;
}

function startOffset(armIndex) {
  return armIndex * CELLS_PER_ARM;
}

// Global ring index a given arm's relative ring position maps to.
export function relativeToGlobalRing(armIndex, relPos) {
  if (relPos < 0 || relPos >= trackSteps()) return null;
  return (startOffset(armIndex) + relPos) % RING_LENGTH;
}

function safeGlobalCells() {
  const cells = new Set();
  for (let i = 0; i < ARMS; i++) {
    cells.add(startOffset(i));
    cells.add(startOffset(i) + 8);
  }
  return cells;
}

export function isSafeGlobalCell(globalIndex) {
  return safeGlobalCells().has(globalIndex);
}

export function isSafeRelativeCell(armIndex, relPos) {
  const g = relativeToGlobalRing(armIndex, relPos);
  return g !== null && isSafeGlobalCell(g);
}

// ---- Geometry (for rendering) --------------------------------------------
//
// A real board's shared path is rectilinear (straight runs with 90° turns
// hugging the board's outer edge), not a diagonal chord through the
// center. This is the standard 15x15-grid layout used by essentially every
// physical and digital Ludo board, derived here from arm 0's 13 ring cells
// / 6 home cells / 4 yard cells by rotating 90° at a time for arms 1-3
// (verified against the well-known real board: each arm's start cell, safe
// cells, and home-column finish cell land exactly where every reference
// implementation puts them).
const VIEWBOX = 1000;
const CENTER = { x: VIEWBOX / 2, y: VIEWBOX / 2 };
const GRID_SIZE = 15;
const GRID_CELL = 56;
const GRID_ORIGIN = (VIEWBOX - (GRID_SIZE - 1) * GRID_CELL) / 2;

function gridPoint(row, col) {
  return { x: GRID_ORIGIN + col * GRID_CELL, y: GRID_ORIGIN + row * GRID_CELL };
}

// Rotates a [row, col] 90° clockwise around the grid center, `turns` times.
function rotateGrid([row, col], turns) {
  let r = row;
  let c = col;
  for (let i = 0; i < turns; i++) {
    const nr = c;
    const nc = GRID_SIZE - 1 - r;
    r = nr;
    c = nc;
  }
  return [r, c];
}

const CLASSIC_ARM0_RING = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7], [0, 8],
];
const CLASSIC_ARM0_HOME = [
  [7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6],
];
// The 4 waiting tokens sit centered inside a white inset square (the
// "cage"), not directly on the arm color — matching a real board, where
// the corner is a colored frame around a white box holding the tokens.
const CLASSIC_ARM0_YARD = [
  [1.5, 1.5], [1.5, 3.5], [3.5, 1.5], [3.5, 3.5],
];
// The cage's white square, inset exactly one grid cell from the yard
// corner's outer edge (row/col -0.5..5.5) so the colored border reads as
// one step thick. Grid coordinates here are cell *edges*, not centers —
// see rectFromEdges.
const CLASSIC_ARM0_CAGE = [0.5, 4.5, 0.5, 4.5];
// The small colored "finish" pinwheel at dead center: arm 0's wedge is the
// west edge of the 3x3 hub square (matching its home column, which
// approaches from the west), rotated 90° per arm for the rest.
const CLASSIC_ARM0_PINWHEEL = [[6, 6], [8, 6]];
// Each arm's big color block: the corner it owns plus the arm corridor
// leading to the center, expressed as an inclusive [rowStart, rowEnd,
// colStart, colEnd] grid box. Arm 0 owns the top-left; rotating the box's
// two corners 90° at a time gives the other three.
const CLASSIC_ARM0_BLOCK = [0, 7, 0, 7];

function rotateBlock([r0, r1, c0, c1], turns) {
  const [a, b] = rotateGrid([r0, c0], turns);
  const [c, d] = rotateGrid([r1, c1], turns);
  return [Math.min(a, c), Math.max(a, c), Math.min(b, d), Math.max(b, d)];
}

// Like `block`'s pixel conversion, but for a box already given in cell
// *edge* coordinates (e.g. -0.5..5.5) rather than inclusive cell indices,
// so no +1/-half cell adjustment is needed.
function rectFromEdges([rowStart, rowEnd, colStart, colEnd]) {
  return {
    x: GRID_ORIGIN + colStart * GRID_CELL,
    y: GRID_ORIGIN + rowStart * GRID_CELL,
    width: (colEnd - colStart) * GRID_CELL,
    height: (rowEnd - rowStart) * GRID_CELL,
  };
}

function computeBoardLayout() {
  const ringCells = new Array(RING_LENGTH);
  const armLayouts = Array.from({ length: ARMS }, (_, armIndex) => {
    const ringGrid = CLASSIC_ARM0_RING.map((rc) => rotateGrid(rc, armIndex));
    ringGrid.forEach((rc, t) => {
      const index = armIndex * CELLS_PER_ARM + t;
      ringCells[index] = { index, ...gridPoint(rc[0], rc[1]) };
    });
    const homeColumn = CLASSIC_ARM0_HOME.map((rc, j) => {
      const [r, c] = rotateGrid(rc, armIndex);
      return { relPos: homeStart() + j, ...gridPoint(r, c) };
    });
    const yardSlots = CLASSIC_ARM0_YARD.map((rc, slot) => {
      const [r, c] = rotateGrid(rc, armIndex);
      return { slot, ...gridPoint(r, c) };
    });
    const [rowStart, rowEnd, colStart, colEnd] = rotateBlock(CLASSIC_ARM0_BLOCK, armIndex);
    const half = GRID_CELL / 2;
    const block = {
      x: gridPoint(0, colStart).x - half,
      y: gridPoint(rowStart, 0).y - half,
      width: (colEnd - colStart + 1) * GRID_CELL,
      height: (rowEnd - rowStart + 1) * GRID_CELL,
    };
    const pinwheelCorners = CLASSIC_ARM0_PINWHEEL.map((rc) => rotateGrid(rc, armIndex)).map(([r, c]) =>
      gridPoint(r, c)
    );
    const cage = rectFromEdges(rotateBlock(CLASSIC_ARM0_CAGE, armIndex));

    // Where a finished token actually sits: the board's true dead center
    // (not homeColumn's last cell, which is one grid square short of it —
    // see tokenPixelPosition), the same point every arm's tokens converge
    // on. A tight per-token spread, same idea as yardSlots, keeps up to 4
    // finished tokens from one seat individually visible instead of
    // fully stacked on one pixel, without reading as "off-center".
    const FINISH_SPREAD = 5;
    const finishSlots = [
      { x: CENTER.x - FINISH_SPREAD, y: CENTER.y - FINISH_SPREAD },
      { x: CENTER.x + FINISH_SPREAD, y: CENTER.y - FINISH_SPREAD },
      { x: CENTER.x - FINISH_SPREAD, y: CENTER.y + FINISH_SPREAD },
      { x: CENTER.x + FINISH_SPREAD, y: CENTER.y + FINISH_SPREAD },
    ].map((p, slot) => ({ slot, ...p }));

    return {
      armIndex,
      color: colorForArm(armIndex),
      startGlobalIndex: startOffset(armIndex),
      homeColumn,
      yardSlots,
      finishSlots,
      block,
      cage,
      pinwheel: [CENTER, ...pinwheelCorners],
    };
  });

  return { viewBox: VIEWBOX, center: CENTER, arms: armLayouts, ringCells };
}

let cachedLayout = null;

export function buildBoardLayout() {
  if (!cachedLayout) cachedLayout = computeBoardLayout();
  return cachedLayout;
}

// Pixel position for a token given its arm, relative position, and (only
// relevant in the yard or once finished) its own token index so the 4
// tokens spread across the 4 yard/finish slots instead of stacking.
export function tokenPixelPosition(armIndex, relPos, tokenIndex = 0) {
  const layout = buildBoardLayout();
  const arm = layout.arms[armIndex];
  if (relPos === YARD) {
    const slot = arm.yardSlots[tokenIndex % arm.yardSlots.length];
    return { x: slot.x, y: slot.y };
  }
  if (relPos === finished()) {
    const slot = arm.finishSlots[tokenIndex % arm.finishSlots.length];
    return { x: slot.x, y: slot.y };
  }
  if (relPos >= homeStart()) {
    const cell = arm.homeColumn[relPos - homeStart()];
    return { x: cell.x, y: cell.y };
  }
  const globalIndex = relativeToGlobalRing(armIndex, relPos);
  const cell = layout.ringCells[globalIndex];
  return { x: cell.x, y: cell.y };
}
