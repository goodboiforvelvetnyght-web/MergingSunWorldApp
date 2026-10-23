import { describe, it, expect } from "vitest";
import {
  DEFAULT_WORLD,
  allHexes,
  brushHexes,
  center,
  hexAt,
  key,
  inBounds,
  hexDistance,
  findRoute,
  normalizeWorld,
  normalizeTile,
  type World,
} from "../shared/world";
import { TERRAIN_TYPES } from "../shared/travelRules";
import { encodeTile, decodeTile, serializeWorld } from "../shared/tileStorage";
import { alignMapArtwork } from "../shared/mapAlignment";
describe("8-unit grids", () => {
  it("losslessly stores every valid terrain, feature, road and river combination", () => {
    for (const terrain of TERRAIN_TYPES)
      for (let flags = 0; flags < 16; flags++) {
        if (flags & 2 && flags & 4) continue;
        for (const road of [false, true])
          for (const river of [false, true]) {
            const tile = {
              terrain,
              features: (
                ["forest", "hills", "mountain", "marsh"] as const
              ).filter((_, i) => !!(flags & (1 << i))),
              river,
              road,
            };
            expect(encodeTile(tile)).toHaveLength(2);
            expect(decodeTile(encodeTile(tile))).toEqual(normalizeTile(tile));
          }
      }
    expect(decodeTile("aw")).toEqual({
      terrain: "plains",
      features: ["forest"],
      river: true,
      road: true,
    });
    expect(
      encodeTile({
        terrain: "plains",
        features: ["mountain"],
        river: false,
        road: true,
      }),
    ).toBe("80");
    const legacy = { terrain: "forest" as const, river: true, road: true };
    expect(decodeTile(encodeTile(legacy))).toEqual(normalizeTile(legacy));
    for (const bad of ["", "!", "000", "zz", "ff", "06", "07", "1c"])
      expect(() => decodeTile(bad)).toThrow();
  });
  it("fits a fully painted maximum-size grid below the existing document limit and reloads it unchanged", () => {
    const world: World = {
      ...DEFAULT_WORLD,
      mapWidth: 2400,
      mapHeight: 2400,
      radius: 8,
      tiles: {},
    };
    for (const h of allHexes(world))
      world.tiles[key(h)] = {
        terrain: "plains",
        features: ["forest"],
        river: true,
        road: true,
      };
    expect(Object.keys(world.tiles).length).toBeGreaterThan(30000);
    expect(JSON.stringify(world).length).toBeGreaterThan(800000);
    const stored = serializeWorld(world);
    expect(JSON.stringify(stored).length).toBeLessThan(800000);
    expect(normalizeWorld(stored)).toEqual(normalizeWorld(world));
    expect(typeof world.tiles["0,0"]).toBe("object");
  });
  it("finds a least-energy route across a dense grid that exceeds the old search budget", () => {
    const world: World = { ...DEFAULT_WORLD, radius: 8, tiles: {} };
    for (const h of allHexes(world))
      world.tiles[key(h)] = { terrain: "plains", river: false };
    const start = { q: 5, r: 5 },
      end = { q: 110, r: 125 },
      route = findRoute(start, end, world)!;
    expect(route).not.toBeNull();
    expect(route.cost).toBe(hexDistance(start, end) * 2);
    expect(route.steps).toBe(hexDistance(start, end));
    expect(route.path[0]).toEqual(start);
    expect(route.path.at(-1)).toEqual(end);
  });
  it("covers translated tiny grids and paints only the local brush footprint", () => {
    const world = { ...DEFAULT_WORLD, radius: 8, offsetX: 225, offsetY: 240 },
      cells = allHexes(world);
    for (const h of cells.filter((_, i) => i % 100 === 0))
      expect(hexAt(center(h, world), world)).toEqual(h);
    const h = { q: 20, r: 20 };
    for (const size of [1, 2, 3])
      expect(brushHexes(h, size, world).map(key).sort()).toEqual(
        allHexes(world)
          .filter((n) => hexDistance(n, h) < size)
          .map(key)
          .sort(),
      );
    for (const n of brushHexes(hexAt({ x: 0, y: 0 }, world), 3, world))
      expect(inBounds(n, world)).toBe(true);
  });
  it("permits artwork alignment down to exactly 8 units and still rejects smaller results", () => {
    const world = {
      ...DEFAULT_WORLD,
      radius: 16,
      locations: [],
      territories: [],
    };
    expect(
      alignMapArtwork(
        world,
        {
          id: null,
          nativeZoom: 3,
          mapWidth: 1200,
          mapHeight: 900,
          mapLayout: "natural",
        },
        "fit",
      ).radius,
    ).toBe(8);
    expect(() =>
      alignMapArtwork(
        { ...world, radius: 15 },
        {
          id: null,
          nativeZoom: 3,
          mapWidth: 1200,
          mapHeight: 900,
          mapLayout: "natural",
        },
        "fit",
      ),
    ).toThrow("too small");
  });
});
