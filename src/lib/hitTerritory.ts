// Builds each selectable token's tap-target as a Voronoi-style "territory"
// instead of a plain fixed circle: the largest area around the token that
// stays closer to it than to any other selectable token, capped by an
// outer reach and the board's own edge. Two tokens close together end up
// with a small, tight shared border between them; a token off on its own
// keeps expanding — including lopsidedly toward whichever side actually has
// open space — until it hits the outer cap or the board edge.

export type Point = { x: number; y: number };
export type Bounds = { left: number; right: number; top: number; bottom: number };

type TerritoryOptions = {
  // Every territory contains at least this radius around its own point,
  // even if that means overlapping a very close neighbor — a tap target
  // this tight is a last resort, not a real solution, so a small overlap
  // is the better trade.
  minRadius: number;
  // How far a territory can reach when nothing (no neighbor, no edge) is
  // there to stop it.
  maxRadius: number;
  bounds: Bounds;
  // Vertex count for the initial circle approximation clipping starts
  // from — higher reads rounder, cheap either way at this scale.
  sides?: number;
};

const EPSILON = 1e-6;

function clipPolygon(polygon: Point[], linePoint: Point, normal: Point): Point[] {
  const side = (p: Point) => (p.x - linePoint.x) * normal.x + (p.y - linePoint.y) * normal.y;
  const intersect = (a: Point, b: Point): Point => {
    const da = side(a);
    const db = side(b);
    const t = da / (da - db);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };

  const result: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const curr = polygon[i];
    const prev = polygon[(i - 1 + polygon.length) % polygon.length];
    const currIn = side(curr) <= EPSILON;
    const prevIn = side(prev) <= EPSILON;
    if (currIn) {
      if (!prevIn) result.push(intersect(prev, curr));
      result.push(curr);
    } else if (prevIn) {
      result.push(intersect(prev, curr));
    }
  }
  return result;
}

function circlePolygon(center: Point, radius: number, sides: number): Point[] {
  return Array.from({ length: sides }, (_, i) => {
    const angle = (i / sides) * Math.PI * 2;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
}

export function voronoiTerritory(point: Point, others: Point[], options: TerritoryOptions): Point[] {
  const { minRadius, maxRadius, bounds, sides = 24 } = options;
  let polygon = circlePolygon(point, maxRadius, sides);

  for (const other of others) {
    const dx = other.x - point.x;
    const dy = other.y - point.y;
    const distance = Math.hypot(dx, dy);
    if (distance < EPSILON) continue;
    const ux = dx / distance;
    const uy = dy / distance;
    // The fair split is the perpendicular bisector (half the distance to
    // the neighbor); floored at minRadius so a very close neighbor can't
    // push the border in past the guaranteed minimum. Both points run this
    // same formula on the same pair, so in the normal (unfloored) case
    // they agree on exactly the same line — no gap, no unintended overlap.
    const clipDistance = Math.max(distance / 2, minRadius);
    const linePoint = { x: point.x + ux * clipDistance, y: point.y + uy * clipDistance };
    polygon = clipPolygon(polygon, linePoint, { x: ux, y: uy });
    if (polygon.length === 0) break;
  }

  polygon = clipPolygon(polygon, { x: bounds.left, y: 0 }, { x: -1, y: 0 });
  polygon = clipPolygon(polygon, { x: bounds.right, y: 0 }, { x: 1, y: 0 });
  polygon = clipPolygon(polygon, { x: 0, y: bounds.top }, { x: 0, y: -1 });
  polygon = clipPolygon(polygon, { x: 0, y: bounds.bottom }, { x: 0, y: 1 });

  return polygon;
}
