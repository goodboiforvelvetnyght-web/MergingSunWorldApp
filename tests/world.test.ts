import { describe, it, expect } from "vitest";
import {
  DEFAULT_WORLD,
  normalizeWorld,
  removeKingdom,
  characterAfterWorldChange,
  center,
  hexAt,
  key,
  findRoute,
  tileAt,
  entryCost,
  energyNow,
  spendEnergy,
  makeCharacter,
  MAX_ENERGY,
  REGEN_MS,
  allHexes,
  type World,
} from "../shared/world";
function flat(): World {
  const w = structuredClone(DEFAULT_WORLD);
  for (const h of allHexes(w))
    w.tiles[key(h)] = { terrain: "plains", river: false };
  return w;
}
describe("Walking routes", () => {
  it("round trips hex centers through coordinate conversion", () => {
    for (const radius of [28, 42, 80]) {
      const w = { ...DEFAULT_WORLD, radius, offsetX: 17, offsetY: -11 };
      for (const h of allHexes(w)) expect(hexAt(center(h, w), w)).toEqual(h);
    }
  });
  it("charges only entered tiles, including river surcharges", () => {
    const w = flat(),
      start = { q: 8, r: 8 },
      end = { q: 9, r: 8 };
    w.tiles[key(start)] = { terrain: "mountain", river: true };
    w.tiles[key(end)] = { terrain: "forest", river: true };
    const r = findRoute(start, end, w)!;
    expect(r.cost).toBe(7);
    expect(r.terrainCosts.forest).toBe(4);
    expect(r.riverEntries).toBe(1);
    expect(r.steps).toBe(1);
  });
  it("finds a cheaper detour around expensive terrain", () => {
    const w = flat(),
      start = { q: 8, r: 8 },
      end = { q: 10, r: 8 };
    w.tiles["9,8"] = { terrain: "mountain", river: true };
    const r = findRoute(start, end, w)!;
    expect(r.cost).toBe(6);
    expect(r.path.map(key)).not.toContain("9,8");
  });
  it("blocks water and destinations outside the map", () => {
    const w = flat();
    w.tiles["9,8"] = { terrain: "water", river: true };
    expect(findRoute({ q: 8, r: 8 }, { q: 9, r: 8 }, w)).toBeNull();
    expect(findRoute({ q: 8, r: 8 }, { q: 9999, r: 9999 }, w)).toBeNull();
  });
  it("returns zero cost when already at the destination", () => {
    const w = flat();
    expect(findRoute({ q: 8, r: 8 }, { q: 8, r: 8 }, w)?.cost).toBe(0);
  });
  it("offers reachable sample starting settlements", () => {
    const w = DEFAULT_WORLD,
      home = hexAt(w.locations[0], w);
    for (const l of w.locations.filter((l) => l.starting)) {
      expect(Number.isFinite(entryCost(tileAt(hexAt(l, w), w)))).toBe(true);
      expect(findRoute(home, hexAt(l, w), w)).not.toBeNull();
    }
  });
});
describe("Energy and origins", () => {
  const now = 1_000_000;
  const c = makeCharacter(
    "Rowan",
    "Wanderer",
    "",
    DEFAULT_WORLD.locations[0],
    DEFAULT_WORLD,
    now,
  );
  it("stores a permanent starting settlement ID", () => {
    expect(c.originLocationId).toBe("emberfall");
    expect(c.energy).toBe(MAX_ENERGY);
  });
  it("regenerates lazily, caps energy, and ignores clock rollback", () => {
    const low = { ...c, energy: 10 };
    expect(energyNow(low, now + REGEN_MS * 3 + 100)).toBe(13);
    expect(energyNow(low, now - 100)).toBe(10);
    expect(energyNow(low, now + REGEN_MS * 200)).toBe(100);
  });
  it("preserves partial regeneration time when spending below capacity", () => {
    const low = { ...c, energy: 10 };
    const updated = spendEnergy(low, 3, now + REGEN_MS + 700);
    expect(updated).toEqual({ energy: 8, energyAt: now + REGEN_MS });
  });
  it("does not bank regeneration while at maximum energy", () => {
    const updated = spendEnergy(c, 10, now + REGEN_MS * 200);
    expect(updated).toEqual({ energy: 90, energyAt: now + REGEN_MS * 200 });
  });
  it("rejects overspending and invalid costs", () => {
    expect(() => spendEnergy(c, 101, now)).toThrow();
    expect(() => spendEnergy(c, -1, now)).toThrow();
    expect(() => spendEnergy(c, NaN, now)).toThrow();
  });
});

describe("Kingdom hierarchy and character preservation", () => {
  it("migrates legacy content using explicit names, never border containment", () => {
    const legacy = structuredClone(DEFAULT_WORLD) as any;
    delete legacy.schemaVersion;
    for (const l of legacy.locations) {
      delete l.kingdomId;
      delete l.entries;
    }
    legacy.locations[0].region = "The Sunward Reach";
    legacy.locations[0].x = 2000; // Outside the Reach's border is still an explicit allegiance.
    legacy.locations[1].region = "Unknown legacy region";
    const upgraded = normalizeWorld(legacy);
    expect(upgraded.locations[0].kingdomId).toBe("reach");
    expect(upgraded.locations[1].kingdomId).toBeNull();
    expect(upgraded.locations[1].lore).toBe(legacy.locations[1].lore);
    expect(normalizeWorld(upgraded)).toEqual(upgraded);
  });
  it("keeps a transferred settlement and its entries when its former kingdom is deleted", () => {
    const w = structuredClone(DEFAULT_WORLD);
    const city = w.locations.find((l) => l.id === "emberfall")!;
    city.kingdomId = "coast";
    const next = removeKingdom(normalizeWorld(w), "reach");
    expect(next.locations.find((l) => l.id === city.id)?.entries[0].id).toBe(
      "copper-stag",
    );
    expect(next.locations.find((l) => l.id === city.id)?.x).toBe(city.x);
    expect(next.locations.some((l) => l.id === "thornwatch")).toBe(false);
    expect(next.territories.some((k) => k.id === "reach")).toBe(false);
  });
  it("clears deleted place references without moving or charging a character", () => {
    const c = {
      ...makeCharacter(
        "Rowan",
        "",
        "",
        DEFAULT_WORLD.locations[0],
        DEFAULT_WORLD,
      ),
      x: 735,
      y: 760,
      energy: 53,
      currentLocationId: "emberfall",
      internalLocationId: "copper-stag",
    };
    const next = characterAfterWorldChange(
      c,
      removeKingdom(DEFAULT_WORLD, "reach"),
      false,
    );
    expect(next).toEqual({
      ...c,
      originLocationId: null,
      currentLocationId: null,
      internalLocationId: null,
    });
  });
  it("preserves map position after an origin is deleted, including later grid changes", () => {
    const c = makeCharacter(
      "Rowan",
      "",
      "",
      DEFAULT_WORLD.locations[0],
      DEFAULT_WORLD,
    );
    const deleted = characterAfterWorldChange(
      c,
      removeKingdom(DEFAULT_WORLD, "reach"),
      false,
    );
    const next = characterAfterWorldChange(
      deleted,
      { ...DEFAULT_WORLD, radius: 60, offsetX: 13 },
      true,
    );
    expect(next).toEqual(deleted);
  });
  it("still returns characters with surviving origins when the grid changes", () => {
    const c = {
      ...makeCharacter(
        "Rowan",
        "",
        "",
        DEFAULT_WORLD.locations[0],
        DEFAULT_WORLD,
      ),
      x: 600,
      y: 700,
      energy: 37,
    };
    const world = { ...DEFAULT_WORLD, radius: 48 };
    const next = characterAfterWorldChange(c, world, true);
    expect(next).toMatchObject({
      ...center(hexAt(world.locations[0], world), world),
      energy: 37,
      originLocationId: "emberfall",
    });
  });
});
