import { describe, expect, it } from "vitest";
import {
  borderSegments,
  closestBorderSegment,
  curveSegments,
  flattenSegments,
  smoothRoadPaths,
} from "../shared/curves";
import { DEFAULT_WORLD, center, key, type BorderPoint } from "../shared/world";
import { alignMapArtwork } from "../shared/mapAlignment";
const points: BorderPoint[] = [
  { x: 100, y: 100 },
  { x: 400, y: 120 },
  { x: 420, y: 400 },
  { x: 180, y: 450 },
];
describe("editable spline borders and road display", () => {
  it("keeps legacy straight borders and interpolates every spline point", () => {
    expect(flattenSegments(borderSegments(points))).toEqual([
      ...points,
      points[0],
    ]);
    const segments = borderSegments(points, "smooth");
    for (let i = 0; i < points.length; i++) {
      expect(segments[i][0]).toEqual(points[i]);
      expect(segments[i].at(-1)).toEqual(points[(i + 1) % points.length]);
    }
    expect(segments[0][5].y).not.toBeCloseTo(100 + (20 * 5) / 12);
    const hit = closestBorderSegment(segments[1][6], segments);
    expect(hit.index).toBe(1);
    expect(hit.distance).toBeCloseTo(0);
  });
  it("supports sharp points, repeated anchors and bounded edges without non-finite coordinates", () => {
    const sharp = points.map((p, i) => ({ ...p, sharp: i === 1 }));
    const paths = borderSegments(sharp, "smooth", { width: 430, height: 460 });
    expect(paths[0].at(-1)).toEqual({ x: 400, y: 120 });
    expect(paths[1][0]).toEqual({ x: 400, y: 120 });
    expect(paths[0][11]).not.toEqual(borderSegments(points, "smooth")[0][11]);
    for (const p of flattenSegments(
      borderSegments([points[0], points[0], ...points.slice(1)], "smooth", {
        width: 430,
        height: 460,
      }),
    )) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(460);
    }
  });
  it("preserves point types and border style when changing map proportions", () => {
    const old = structuredClone(DEFAULT_WORLD);
    old.territories[0].borderStyle = "smooth";
    old.territories[0].points[1].sharp = true;
    const next = alignMapArtwork(
      old,
      {
        id: "map",
        nativeZoom: 4,
        mapWidth: 2048,
        mapHeight: 1024,
        mapLayout: "natural",
      },
      "fit",
    );
    expect(next.territories[0].borderStyle).toBe("smooth");
    expect(next.territories[0].points[1].sharp).toBe(true);
  });
  it("smooths road bends through the same hex centres without modifying travel tiles", () => {
    const w = structuredClone(DEFAULT_WORLD),
      cells = [
        { q: 15, r: 10 },
        { q: 16, r: 10 },
        { q: 16, r: 11 },
        { q: 16, r: 12 },
      ];
    w.tiles = Object.fromEntries(
      cells.map((h) => [
        key(h),
        { terrain: "plains", river: true, road: true },
      ]),
    );
    const before = JSON.stringify(w),
      paths = smoothRoadPaths(w);
    expect(paths).toHaveLength(1);
    for (const h of cells) expect(paths[0]).toContainEqual(center(h, w));
    expect(paths[0].length).toBeGreaterThan(cells.length);
    expect(JSON.stringify(w)).toBe(before);
  });
  it("keeps branches connected and renders closed road loops once", () => {
    const w = structuredClone(DEFAULT_WORLD),
      origin = { q: 15, r: 10 };
    const branch = [
      origin,
      { q: 16, r: 10 },
      { q: 14, r: 11 },
      { q: 15, r: 9 },
    ];
    w.tiles = Object.fromEntries(
      branch.map((h) => [
        key(h),
        { terrain: "plains", river: false, road: true },
      ]),
    );
    expect(smoothRoadPaths(w)).toHaveLength(3);
    const ring = [
      [1, 0],
      [1, -1],
      [0, -1],
      [-1, 0],
      [-1, 1],
      [0, 1],
    ].map(([q, r]) => ({ q: origin.q + q, r: origin.r + r }));
    w.tiles = Object.fromEntries(
      ring.map((h) => [
        key(h),
        { terrain: "plains", river: false, road: true },
      ]),
    );
    const paths = smoothRoadPaths(w);
    expect(paths).toHaveLength(1);
    expect(paths[0].at(-1)).toEqual(paths[0][0]);
    expect(curveSegments([{ x: 0, y: 0 }], true)).toEqual([]);
  });
});
