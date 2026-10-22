import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORLD,
  allHexes,
  center,
  findRoute,
  hexAt,
  key,
  tileAt,
  inBounds,
} from "../shared/world";
import {
  alignMapArtwork,
  alignedGrid,
  gridChangedAfterAlignment,
  mapTransform,
  transformPoint,
} from "../shared/mapAlignment";
import { naturalMapDimensions } from "../shared/mapImages";
const artwork = {
  id: "map-image",
  ...naturalMapDimensions(3969, 1814),
  mapLayout: "natural" as const,
};
describe("natural map alignment", () => {
  it("keeps artwork resolution separate from world size", () => {
    expect(naturalMapDimensions(3969, 1814)).toMatchObject({ mapWidth: 2048 });
    const a = naturalMapDimensions(4000, 2000),
      b = naturalMapDimensions(8000, 4000);
    expect(a.mapWidth).toBe(b.mapWidth);
    expect(a.mapHeight).toBe(b.mapHeight);
    expect(a.nativeZoom).toBe(4);
    expect(b.nativeZoom).toBe(5);
  });
  it("uniformly aligns every terrain tile, border and city without changing route costs", () => {
    const old = structuredClone(DEFAULT_WORLD);
    old.territories[0].emblemPosition = { x: 1750, y: 800 };
    const next = alignMapArtwork(old, artwork, "fit"),
      t = mapTransform(old, next, "fit");
    expect(gridChangedAfterAlignment(old, next)).toBe(false);
    expect(next.locations[0]).toMatchObject(
      transformPoint(old.locations[0], t),
    );
    expect(next.territories[0].points[0]).toEqual(
      transformPoint(old.territories[0].points[0], t),
    );
    expect(next.territories[0].emblemPosition).toEqual(
      transformPoint(old.territories[0].emblemPosition, t),
    );
    for (const h of allHexes(old)) {
      const p = transformPoint(center(h, old), t);
      const n = hexAt(p, next);
      expect(center(n, next).x).toBeCloseTo(p.x, 7);
      expect(center(n, next).y).toBeCloseTo(p.y, 7);
      expect(tileAt(n, next)).toEqual(tileAt(h, old));
    }
    const a = hexAt(old.locations[0], old),
      b = { q: a.q + 1, r: a.r };
    old.tiles[key(a)] = { terrain: "plains", river: false, road: true };
    old.tiles[key(b)] = { terrain: "mountain", river: true, road: true };
    const routed = alignMapArtwork(old, artwork, "fit");
    expect(
      findRoute(
        hexAt(transformPoint(center(a, old), t), routed),
        hexAt(transformPoint(center(b, old), t), routed),
        routed,
      )?.cost,
    ).toBe(findRoute(a, b, old)?.cost);
  });
  it("distinguishes manual grid edits and keeps equal-aspect replacements stable", () => {
    const next = alignMapArtwork(DEFAULT_WORLD, artwork, "fit");
    delete next.mapAlignment;
    const replacement = alignMapArtwork(
      next,
      { ...artwork, id: "sharper", nativeZoom: 5 },
      "fit",
    );
    expect(replacement.radius).toBe(next.radius);
    expect(replacement.tiles).toBe(next.tiles);
    expect(replacement.locations).toBe(next.locations);
    expect(
      gridChangedAfterAlignment(DEFAULT_WORLD, {
        ...alignMapArtwork(DEFAULT_WORLD, artwork, "fit"),
        radius: 40,
      }),
    ).toBe(true);
  });
  it("removes old padding without stretching hexes and refuses to crop authored places", () => {
    const previous = {
      ...structuredClone(DEFAULT_WORLD),
      mapAssetId: "old-map",
      locations: [],
      territories: [],
    };
    const next = alignMapArtwork(previous, artwork, "unpad");
    const grid = alignedGrid(previous, next, "unpad");
    expect(grid.transform.x).toBeCloseTo(0);
    expect(grid.transform.y).toBeLessThan(0);
    expect(next.radius).toBeCloseTo((previous.radius * 2048) / 2400);
    expect(() =>
      alignMapArtwork(
        { ...DEFAULT_WORLD, mapAssetId: "old-map" },
        artwork,
        "unpad",
      ),
    ).toThrow(/old padding/);
    expect(() =>
      alignMapArtwork({ ...previous, mapLayout: "natural" }, artwork, "unpad"),
    ).toThrow(/already uses/);
  });
  it("enumerates translated grids completely within portrait and wide bounds", () => {
    for (const [width, height] of [
      [2048, 936],
      [700, 2048],
    ]) {
      const w = {
        ...DEFAULT_WORLD,
        radius: 16,
        offsetX: 225,
        offsetY: 240,
        mapWidth: width,
        mapHeight: height,
      };
      const cells = allHexes(w),
        keys = new Set(cells.map(key));
      expect(keys.size).toBe(cells.length);
      for (let r = -15; r < 100; r++)
        for (let q = -100; q < 100; q++) {
          const h = { q, r };
          if (inBounds(h, w)) expect(keys.has(key(h))).toBe(true);
        }
    }
  });
});
