import { describe, it, expect } from "vitest";
import {
  DEFAULT_WORLD,
  makeCharacter,
  physicalSettlement,
  enteredSettlement,
  populationCounts,
  characterAfterWorldChange,
} from "../shared/world";
describe("Explicit city presence", () => {
  const world = DEFAULT_WORLD,
    city = world.locations[0],
    outside = makeCharacter("Rowan", "", "", city, world, 1234);
  it("starts outside and counts only characters who entered", () => {
    expect(physicalSettlement(outside, world)).toBe(city.id);
    expect(enteredSettlement(outside, world)).toBeNull();
    const inside = {
      ...outside,
      currentLocationId: city.id,
      internalLocationId: "copper-stag",
    };
    expect(enteredSettlement(inside, world)).toBe(city.id);
    expect(populationCounts([outside, inside], world)).toEqual({
      [city.id]: 1,
    });
    expect(enteredSettlement({ ...inside, x: 0, y: 0 }, world)).toBeNull();
  });
  it("grid resets return characters to their origin hex outside without charging energy", () => {
    const inside = {
      ...outside,
      currentLocationId: city.id,
      internalLocationId: "copper-stag",
      energy: 23,
    };
    const updated = characterAfterWorldChange(
      inside,
      { ...world, offsetX: 8 },
      true,
    );
    expect(physicalSettlement(updated, { ...world, offsetX: 8 })).toBe(city.id);
    expect(updated.currentLocationId).toBeNull();
    expect(updated.internalLocationId).toBeNull();
    expect(updated.energy).toBe(23);
    expect(updated.energyAt).toBe(1234);
  });
  it("content-only changes preserve existing city and room occupants", () => {
    const inside = {
      ...outside,
      currentLocationId: city.id,
      internalLocationId: "copper-stag",
    };
    expect(characterAfterWorldChange(inside, world, false)).toEqual(inside);
  });
});
