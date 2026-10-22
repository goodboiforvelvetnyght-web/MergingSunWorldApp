import {
  center,
  inBounds,
  key,
  neighbors,
  tileAt,
  type BorderPoint,
  type Point,
  type World,
} from "./world.js";
export type BorderStyle = "straight" | "smooth";
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const blend = (
  a: Point,
  b: Point,
  ta: number,
  tb: number,
  t: number,
): Point => {
  const f = (t - ta) / Math.max(1e-6, tb - ta);
  return { x: a.x * (1 - f) + b.x * f, y: a.y * (1 - f) + b.y * f };
};
/** Centripetal Catmull–Rom interpolates control points without Bezier handles. */
export function curveSegments(
  points: BorderPoint[],
  smooth: boolean,
  closed = true,
  samples = 12,
): Point[][] {
  if (points.length < 2) return [];
  const n = points.length,
    count = closed ? n : n - 1;
  return Array.from({ length: count }, (_, i) => {
    const p1 = points[i],
      p2 = points[(i + 1) % n];
    if (!smooth || distance(p1, p2) < 1e-6)
      return [
        { x: p1.x, y: p1.y },
        { x: p2.x, y: p2.y },
      ];
    const p0 =
      p1.sharp || (!closed && i === 0)
        ? { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y }
        : points[(i - 1 + n) % n];
    const p3 =
      p2.sharp || (!closed && i === count - 1)
        ? { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y }
        : points[(i + 2) % n];
    const t0 = 0,
      t1 = Math.max(1e-4, Math.sqrt(distance(p0, p1))),
      t2 = t1 + Math.max(1e-4, Math.sqrt(distance(p1, p2))),
      t3 = t2 + Math.max(1e-4, Math.sqrt(distance(p2, p3)));
    return Array.from({ length: samples + 1 }, (_, j) => {
      if (j === 0) return { x: p1.x, y: p1.y };
      if (j === samples) return { x: p2.x, y: p2.y };
      const t = t1 + ((t2 - t1) * j) / samples;
      const a1 = blend(p0, p1, t0, t1, t),
        a2 = blend(p1, p2, t1, t2, t),
        a3 = blend(p2, p3, t2, t3, t);
      return blend(
        blend(a1, a2, t0, t2, t),
        blend(a2, a3, t1, t3, t),
        t1,
        t2,
        t,
      );
    });
  });
}
export function borderSegments(
  points: BorderPoint[],
  style: BorderStyle = "straight",
  bounds?: { width: number; height: number },
) {
  const segments = curveSegments(
    points,
    style === "smooth",
    points.length >= 3,
  );
  return bounds
    ? segments.map((segment) =>
        segment.map((p) => ({
          x: Math.max(0, Math.min(bounds.width, p.x)),
          y: Math.max(0, Math.min(bounds.height, p.y)),
        })),
      )
    : segments;
}
export const flattenSegments = (segments: Point[][]) =>
  segments.flatMap((s, i) => (i ? s.slice(1) : s));
export function closestBorderSegment(p: Point, segments: Point[][]) {
  let index = -1,
    best = Infinity,
    closest = p;
  for (const [i, segment] of segments.entries())
    for (let j = 1; j < segment.length; j++) {
      const a = segment[j - 1],
        b = segment[j],
        dx = b.x - a.x,
        dy = b.y - a.y;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((p.x - a.x) * dx + (p.y - a.y) * dy) /
            Math.max(1e-9, dx * dx + dy * dy),
        ),
      );
      const d = distance(p, { x: a.x + dx * t, y: a.y + dy * t });
      if (d < best) {
        best = d;
        index = i;
        closest = { x: a.x + dx * t, y: a.y + dy * t };
      }
    }
  return { index, distance: best, point: closest };
}
/** Trace each graph edge once; branches meet at tile centres and loops stay closed. */
export function smoothRoadPaths(world: World): Point[][] {
  const nodes = new Map<string, { point: Point; links: string[] }>();
  for (const [id, tile] of Object.entries(world.tiles)) {
    if (!tile.road || tile.terrain === "water") continue;
    const [q, r] = id.split(",").map(Number),
      h = { q, r };
    if (!inBounds(h, world)) continue;
    nodes.set(id, {
      point: center(h, world),
      links: neighbors(h)
        .filter(
          (n) =>
            inBounds(n, world) &&
            tileAt(n, world).road &&
            tileAt(n, world).terrain !== "water",
        )
        .map(key),
    });
  }
  const used = new Set<string>(),
    paths: Point[][] = [];
  const edge = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const trace = (start: string, next: string) => {
    const path = [nodes.get(start)!.point];
    let previous = start,
      current = next,
      closed = false;
    while (true) {
      used.add(edge(previous, current));
      if (current === start) {
        closed = true;
        break;
      }
      const node = nodes.get(current);
      if (!node) break;
      path.push(node.point);
      if (node.links.length !== 2) break;
      const following = node.links.find((k) => k !== previous)!;
      if (used.has(edge(current, following))) break;
      previous = current;
      current = following;
    }
    paths.push(flattenSegments(curveSegments(path, true, closed, 8)));
  };
  for (const [id, node] of nodes) {
    if (!node.links.length)
      paths.push([
        { x: node.point.x - 9, y: node.point.y },
        { x: node.point.x + 9, y: node.point.y },
      ]);
    if (node.links.length !== 2)
      for (const next of node.links)
        if (!used.has(edge(id, next))) trace(id, next);
  }
  for (const [id, node] of nodes)
    for (const next of node.links)
      if (!used.has(edge(id, next))) trace(id, next);
  return paths.filter((p) => p.length >= 2);
}
