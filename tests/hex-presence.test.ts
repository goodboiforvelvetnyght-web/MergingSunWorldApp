import { it, expect } from "vitest";
import {
  DEFAULT_WORLD,
  makeCharacter,
  hexPopulationCounts,
  populationCounts,
  key,
  hexAt,
  center,
  sameCharacterHex,
} from "../shared/world";
it("counts outside, city and room characters once per hex, independently of city occupancy", () => {
  const w = DEFAULT_WORLD,
    c = makeCharacter("A", "", "", w.locations[0], w, 1),
    city = { ...c, currentLocationId: w.locations[0].id },
    room = { ...city, internalLocationId: "copper-stag" };
  const h = key(hexAt(c, w));
  expect(hexPopulationCounts([c, city, room], w)).toEqual({ [h]: 3 });
  expect(populationCounts([c, city, room], w)).toEqual({
    [w.locations[0].id]: 2,
  });
  expect(sameCharacterHex(c, { ...room, x: room.x + 1 }, w)).toBe(true);
  expect(sameCharacterHex(c, center({ q: 2, r: 2 }, w), w)).toBe(false);
  const moved = { ...room, ...center({ q: 2, r: 2 }, w) };
  expect(hexPopulationCounts([c, city, moved], w)).toEqual({
    [h]: 2,
    "2,2": 1,
  });
  expect(hexPopulationCounts([], w)).toEqual({});
});
