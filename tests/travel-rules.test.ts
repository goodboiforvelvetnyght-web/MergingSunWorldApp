import { describe, it, expect } from "vitest";
import { DEFAULT_TRAVEL_RULES, travelRulesError } from "../shared/travelRules";
import {
  DEFAULT_WORLD,
  normalizeWorld,
  normalizeTile,
  paintFeature,
  entryCost,
  findRoute,
  key,
  allHexes,
  tileTravelCost,
} from "../shared/world";

describe("Terrain features and configurable walking rules", () => {
  it("migrates old maps without dropping roads, rivers, or character-related world data", () => {
    const original = {
      ...normalizeWorld(DEFAULT_WORLD),
      tiles: {
        a: { terrain: "forest" as const, river: true, road: true },
        b: { terrain: "mountain" as const, river: false },
        c: { terrain: "water" as const, river: false },
      },
    };
    const migrated = normalizeWorld(original);
    expect(migrated.tiles.a).toEqual({
      terrain: "plains",
      features: ["forest"],
      river: true,
      road: true,
    });
    expect(migrated.tiles.b).toEqual({
      terrain: "plains",
      features: ["mountain"],
      river: false,
      road: false,
    });
    expect(migrated.tiles.c.terrain).toBe("ocean");
    expect(migrated.locations).toEqual(original.locations);
    expect(original.tiles.a.terrain).toBe("forest");
    expect(normalizeWorld(migrated)).toEqual(migrated);
  });
  it("stacks and erases individual features while making hills and mountains exclusive", () => {
    const tile = normalizeTile({
      terrain: "desert",
      features: ["forest", "hills"],
      river: true,
      road: true,
    });
    const mountain = paintFeature(tile, "mountain", true);
    expect(mountain).toEqual({ ...tile, features: ["forest", "mountain"] });
    expect(paintFeature(mountain, "forest", false)).toEqual({
      ...mountain,
      features: ["mountain"],
    });
    expect(paintFeature(mountain, "hills", true)).toEqual(tile);
    expect(paintFeature(tile, "river", false)).toEqual({
      ...tile,
      river: false,
    });
  });
  it("blocks water even with roads and requires an undiscounted mountain road", () => {
    for (const terrain of ["coast", "ocean"] as const)
      expect(entryCost({ terrain, river: false, road: true })).toBe(Infinity);
    expect(
      entryCost({ terrain: "plains", features: ["mountain"], river: false }),
    ).toBe(Infinity);
    expect(
      entryCost({
        terrain: "plains",
        features: ["mountain", "forest"],
        river: true,
        road: true,
      }),
    ).toBe(25);
    expect(
      entryCost({
        terrain: "plains",
        features: ["forest", "hills"],
        river: true,
        road: true,
      }),
    ).toBe(6.5);
  });
  it("uses configurable costs, restrictions and road exceptions consistently", () => {
    const rules = structuredClone(DEFAULT_TRAVEL_RULES);
    rules.terrain.plains.cost = 6;
    rules.features.forest.cost = 5;
    rules.features.forest.road = "none";
    const tile = {
      terrain: "plains" as const,
      features: ["forest" as const],
      river: true,
      road: true,
    };
    expect(entryCost(tile, { travelRules: rules })).toBe(11);
    expect(tileTravelCost(tile, { travelRules: rules }).savings).toBe(3);
    rules.features.forest.walking = "blocked";
    expect(entryCost(tile, { travelRules: rules })).toBe(Infinity);
  });
  it("finds the least-energy detour when configurable road costs are below one", () => {
    const world = structuredClone(DEFAULT_WORLD);
    world.travelRules = structuredClone(DEFAULT_TRAVEL_RULES);
    world.travelRules.terrain.plains.cost = 1;
    for (const h of allHexes(world))
      world.tiles[key(h)] = { terrain: "plains", river: false };
    for (const id of ["8,9", "9,9", "10,9", "11,8"])
      world.tiles[id].road = true;
    const route = findRoute({ q: 8, r: 8 }, { q: 11, r: 8 }, world)!;
    expect(route.rawCost).toBe(2);
    expect(route.steps).toBe(4);
    expect(Object.values(route.terrainCosts).reduce((a, b) => a + b, 0)).toBe(
      route.rawCost,
    );
  });
  it("rejects invalid, missing, fractional and unknown rule definitions", () => {
    expect(travelRulesError(DEFAULT_TRAVEL_RULES)).toBeNull();
    for (const value of [-1, 0, 0.5, 101, Infinity, NaN, null, "2"]) {
      const rules = structuredClone(DEFAULT_TRAVEL_RULES);
      rules.terrain.plains.cost = value as number;
      expect(travelRulesError(rules)).not.toBeNull();
    }
    expect(travelRulesError({ terrain: {}, features: {} })).not.toBeNull();
    expect(
      travelRulesError({ ...DEFAULT_TRAVEL_RULES, extra: {} }),
    ).not.toBeNull();
  });
});
