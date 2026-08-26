// Ludo board geometry and cell classification, generalized to N arms.
//
// The board shape follows the player count: 2-4 players share the classic
// 4-arm square/cross board (with unused arms left blank), 5 players get a
// pentagon, 6 players get a hexagon. Each arm carries 13 shared "ring"
// cells; the full ring has (arms * 13) cells. Each arm also owns a 6-cell
// home column that cuts from the ring inward to the center, and a 4-slot
// yard where its tokens wait before entering.
//
// Token position is a single relative integer per arm:
//   -1               -> in the yard, not yet on the board
//   0 .. ringLength-2 -> the shared ring cells that make up one full lap
//   ringLength-1 .. +5 -> the 6 home-column cells (last one = finished)

const CELLS_PER_ARM = 13;
const HOME_STEPS = 6;
export const TOKENS_PER_SEAT = 4;
export const YARD = -1;

// Bright, saturated "toy" colors to match a traditional physical Ludo board.
// Ordered so a 4-arm board gets exactly the classic red/green/yellow/blue
// set, and 5/6-arm boards extend it with orange/purple.
const ARM_COLORS = [
  { id: "red", label: "Red", hex: "#E8262C" },
  { id: "green", label: "Green", hex: "#1F9E4C" },
  { id: "yellow", label: "Yellow", hex: "#FFCC00" },
  { id: "blue", label: "Blue", hex: "#1565E8" },
  { id: "orange", label: "Orange", hex: "#FF8A00" },
  { id: "purple", label: "Purple", hex: "#8E24C4" },
];

// 2-4 players share the classic 4-arm board; 5 and 6 get their own
// fully-symmetric pentagon/hexagon.
export function armsForPlayerCount(totalPlayers) {
  return totalPlayers <= 4 ? 4 : totalPlayers;
}

// Deterministic seat -> arm assignment so a partially-filled classic board
// blanks out symmetrically (2p = opposite corners, 3p = one corner blank)
// instead of depending on which arm a player happens to pick.
export function armForSeatIndex(seatIndex, totalPlayers) {
  const arms = armsForPlayerCount(totalPlayers);
  return Math.floor((seatIndex * arms) / totalPlayers);
}

export function colorForArm(armIndex) {
  return ARM_COLORS[armIndex];
}

function ringLength(arms) {
  return arms * CELLS_PER_ARM;
}

// Relative position where a token turns off the shared ring into its own
// home column, and the final "finished" position.
export function trackSteps(arms) {
  return ringLength(arms) - 1;
}

function homeStart(arms) {
  return trackSteps(arms);
}

export function finished(arms) {
  return homeStart(arms) + HOME_STEPS - 1;
}

function startOffset(armIndex) {
  return armIndex * CELLS_PER_ARM;
}

// Global ring index a given arm's relative ring position maps to.
export function relativeToGlobalRing(armIndex, relPos, arms) {
  if (relPos < 0 || relPos >= trackSteps(arms)) return null;
  return (startOffset(armIndex) + relPos) % ringLength(arms);
}

function safeGlobalCells(arms) {
  const cells = new Set();
  for (let i = 0; i < arms; i++) {
    cells.add(startOffset(i));
    cells.add(startOffset(i) + 8);
  }
  return cells;
}

export function isSafeGlobalCell(globalIndex, arms) {
  return safeGlobalCells(arms).has(globalIndex);
}

export function isSafeRelativeCell(armIndex, relPos, arms) {
  const g = relativeToGlobalRing(armIndex, relPos, arms);
  return g !== null && isSafeGlobalCell(g, arms);
}

// ---- Geometry (for rendering) --------------------------------------------

// A real board is mostly big solid-color corner yards with a comparatively
// narrow cross-shaped path — not a thin ring with small yards tacked on —
// so the ring sits much closer to the center, leaving room for large yards
// out toward the board's edge.
const VIEWBOX = 1000;
const CENTER = { x: VIEWBOX / 2, y: VIEWBOX / 2 };
const RING_RADIUS = 225;
// Kept close to the ring (rather than out near the star points' narrow
// tips) since a 5/6-arm board's points taper — the token wells need to sit
// where the point is still wide enough to hold them without overflowing,
// while still clearing the ring itself.
const YARD_RADIUS = 320;
const YARD_SPREAD = 48;

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function radialPoint(angleDeg, radius) {
  const angle = (angleDeg * Math.PI) / 180;
  return { x: CENTER.x + radius * Math.cos(angle), y: CENTER.y + radius * Math.sin(angle) };
}

// A real board's ring never cuts a straight diagonal chord between two star
// points — each arm's path runs outbound roughly parallel to its own home
// column, bends once near the hub, then runs back out roughly parallel to
// the *next* color's home column until it reaches that color's start. This
// builds exactly that: two radial-leaning legs joined by a short arc at a
// tighter "corner" radius near the hub, instead of one straight line.
const RING_CORNER_RADIUS = 145;
const RING_LEAN = 0.22; // how far each leg drifts from the true arm angle, as a fraction of one arm's step
export const RING_LEG_A = 5; // cells leaning from this arm's own angle toward the corner
export const RING_LEG_BRIDGE = 3; // cells sweeping across at the corner radius
const RING_LEG_B = CELLS_PER_ARM - RING_LEG_A - RING_LEG_BRIDGE; // cells leaning back out to the next arm's angle

function buildRingCells(arms) {
  const cells = new Array(ringLength(arms));
  const step = 360 / arms;
  for (let arm = 0; arm < arms; arm++) {
    const ownAngle = -90 + arm * step;
    const leanAngle = ownAngle + step * RING_LEAN;
    const nextLeanAngle = ownAngle + step * (1 - RING_LEAN);
    let t = 0;

    for (let i = 0; i < RING_LEG_A; i++, t++) {
      const angle = ownAngle + ((leanAngle - ownAngle) * i) / (RING_LEG_A - 1);
      const radius = RING_RADIUS - ((RING_RADIUS - RING_CORNER_RADIUS) * i) / (RING_LEG_A - 1);
      cells[arm * CELLS_PER_ARM + t] = { index: arm * CELLS_PER_ARM + t, ...radialPoint(angle, radius) };
    }
    for (let i = 0; i < RING_LEG_BRIDGE; i++, t++) {
      const angle = leanAngle + ((nextLeanAngle - leanAngle) * (i + 1)) / (RING_LEG_BRIDGE + 1);
      cells[arm * CELLS_PER_ARM + t] = { index: arm * CELLS_PER_ARM + t, ...radialPoint(angle, RING_CORNER_RADIUS) };
    }
    for (let i = 0; i < RING_LEG_B; i++, t++) {
      const angle = nextLeanAngle + ((ownAngle + step - nextLeanAngle) * i) / (RING_LEG_B - 1);
      const radius = RING_CORNER_RADIUS + ((RING_RADIUS - RING_CORNER_RADIUS) * i) / (RING_LEG_B - 1);
      cells[arm * CELLS_PER_ARM + t] = { index: arm * CELLS_PER_ARM + t, ...radialPoint(angle, radius) };
    }
  }
  return cells;
}

function buildHomeColumn(armIndex, ringCells, arms) {
  const entranceIndex = (startOffset(armIndex) - 1 + ringLength(arms)) % ringLength(arms);
  const entrance = ringCells[entranceIndex];
  const cells = [];
  for (let j = 1; j <= HOME_STEPS; j++) {
    cells.push({
      relPos: homeStart(arms) + (j - 1),
      ...lerp(entrance, CENTER, j / (HOME_STEPS + 1)),
    });
  }
  return cells;
}

function buildYardSlots(armIndex, arms) {
  const angle = ((-90 + (armIndex * 360) / arms + 180 / arms) * Math.PI) / 180;
  const center = {
    x: CENTER.x + YARD_RADIUS * Math.cos(angle),
    y: CENTER.y + YARD_RADIUS * Math.sin(angle),
  };
  const tangent = { x: -Math.sin(angle), y: Math.cos(angle) };
  const radial = { x: Math.cos(angle), y: Math.sin(angle) };
  const offsets = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];
  return offsets.map(([tOff, rOff], slot) => ({
    slot,
    x: center.x + tangent.x * tOff * YARD_SPREAD + radial.x * rOff * YARD_SPREAD,
    y: center.y + tangent.y * tOff * YARD_SPREAD + radial.y * rOff * YARD_SPREAD,
  }));
}

// ---- Classic 4-player layout ----------------------------------------------
//
// A 4-arm board isn't rendered as a generic N-gon — a real Ludo board's
// shared path is rectilinear (straight runs with 90° turns hugging the
// board's outer edge), not a diagonal chord through the center. This is the
// standard 15x15-grid layout used by essentially every physical and digital
// Ludo board, derived here from arm 0's 13 ring cells / 6 home cells / 4
// yard cells by rotating 90° at a time for arms 1-3 (verified against the
// well-known real board: each arm's start cell, safe cells, and home-column
// finish cell land exactly where every reference implementation puts them).
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
const CLASSIC_ARM0_YARD = [
  [2, 2], [2, 3], [3, 2], [3, 3],
];
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

function buildClassicLayout() {
  const arms = 4;
  const ringCells = new Array(ringLength(arms));
  const armLayouts = Array.from({ length: arms }, (_, armIndex) => {
    const ringGrid = CLASSIC_ARM0_RING.map((rc) => rotateGrid(rc, armIndex));
    ringGrid.forEach((rc, t) => {
      const index = armIndex * CELLS_PER_ARM + t;
      ringCells[index] = { index, ...gridPoint(rc[0], rc[1]) };
    });
    const homeColumn = CLASSIC_ARM0_HOME.map((rc, j) => {
      const [r, c] = rotateGrid(rc, armIndex);
      return { relPos: homeStart(arms) + j, ...gridPoint(r, c) };
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

    return {
      armIndex,
      color: colorForArm(armIndex),
      startGlobalIndex: startOffset(armIndex),
      homeColumn,
      yardSlots,
      block,
      pinwheel: [CENTER, ...pinwheelCorners],
    };
  });

  return { viewBox: VIEWBOX, center: CENTER, arms: armLayouts, ringCells };
}

function buildStarLayout(arms) {
  const ringCells = buildRingCells(arms);
  const armLayouts = Array.from({ length: arms }, (_, armIndex) => ({
    armIndex,
    color: colorForArm(armIndex),
    startGlobalIndex: startOffset(armIndex),
    homeColumn: buildHomeColumn(armIndex, ringCells, arms),
    yardSlots: buildYardSlots(armIndex, arms),
  }));
  return { viewBox: VIEWBOX, center: CENTER, arms: armLayouts, ringCells };
}

const layoutCache = new Map();

export function buildBoardLayout(arms) {
  const cached = layoutCache.get(arms);
  if (cached) return cached;

  const layout = arms === 4 ? buildClassicLayout() : buildStarLayout(arms);
  layoutCache.set(arms, layout);
  return layout;
}

// Pixel position for a token given its arm, relative position, board size
// (arms), and (only relevant while in the yard) its own token index so the
// 4 tokens spread across the 4 yard slots instead of stacking.
export function tokenPixelPosition(armIndex, relPos, arms, tokenIndex = 0) {
  const layout = buildBoardLayout(arms);
  const arm = layout.arms[armIndex];
  if (relPos === YARD) {
    const slot = arm.yardSlots[tokenIndex % arm.yardSlots.length];
    return { x: slot.x, y: slot.y };
  }
  if (relPos >= homeStart(arms)) {
    const cell = arm.homeColumn[relPos - homeStart(arms)];
    return { x: cell.x, y: cell.y };
  }
  const globalIndex = relativeToGlobalRing(armIndex, relPos, arms);
  const cell = layout.ringCells[globalIndex];
  return { x: cell.x, y: cell.y };
}
