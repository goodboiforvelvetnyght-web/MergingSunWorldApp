import { it, expect } from "vitest";
import {
  DEFAULT_WORLD,
  normalizeWorld,
  makeCharacter,
  center,
  hexAt,
  sailCharacter,
  sailingCost,
} from "../shared/world";
import { travelRulesError } from "../shared/travelRules";
const world = () => {
  const w = normalizeWorld(DEFAULT_WORLD);
  w.locations = w.locations.map((l) => ({
    ...l,
    harbour: ["emberfall", "sunspire", "thornwatch"].includes(l.id),
  }));
  return w;
};
it("sailing has a configurable flat cost and arrives inside the destination, outside rooms", () => {
  const w = world();
  const c = {
    ...makeCharacter("Sailor", "", "", w.locations[0], w),
    currentLocationId: "emberfall",
    internalLocationId: "copper-stag",
  };
  for (const id of ["sunspire", "thornwatch"]) {
    const result = sailCharacter(c, w, "emberfall", id, c.energyAt);
    expect(result.energy).toBe(c.energy - 10);
    expect(result.currentLocationId).toBe(id);
    expect(result.internalLocationId).toBeNull();
    expect({ x: result.x, y: result.y }).toEqual(
      center(
        hexAt(
          w.locations.find((l) => l.id === id)!,
          w,
        ),
        w,
      ),
    );
  }
  w.travelRules!.sailingCost = 7;
  expect(sailingCost(w)).toBe(7);
  expect(sailCharacter(c, w, "emberfall", "sunspire", c.energyAt).energy).toBe(
    c.energy - 7,
  );
});
it("sailing requires a valid departure, distinct harbour destination and sufficient energy", () => {
  const w = world();
  const c = {
    ...makeCharacter("Sailor", "", "", w.locations[0], w),
    currentLocationId: "emberfall",
  };
  for (const [from, to] of [
    ["emberfall", "emberfall"],
    ["emberfall", "highmere"],
    ["sunspire", "emberfall"],
  ])
    expect(() => sailCharacter(c, w, from, to, c.energyAt)).toThrow();
  expect(() =>
    sailCharacter(
      { ...c, currentLocationId: null },
      w,
      "emberfall",
      "sunspire",
      c.energyAt,
    ),
  ).toThrow();
  expect(() =>
    sailCharacter({ ...c, energy: 0 }, w, "emberfall", "sunspire", c.energyAt),
  ).toThrow();
  for (const cost of [0, -1, 1.5, 101, NaN])
    expect(
      travelRulesError({ ...w.travelRules, sailingCost: cost }),
    ).toBeTruthy();
});
