import { describe, it, expect } from "vitest";
import {
  DEFAULT_MAP_PRESENTATION,
  mapPresentationError,
  iconPresentation,
} from "../shared/mapPresentation";
import { DEFAULT_WORLD, normalizeWorld } from "../shared/world";
describe("map presentation", () => {
  it("upgrades existing worlds without altering geometry", () => {
    const w = normalizeWorld(DEFAULT_WORLD);
    expect(w.mapPresentation).toEqual(DEFAULT_MAP_PRESENTATION);
    expect(w.radius).toBe(DEFAULT_WORLD.radius);
    expect(w.locations.map(({ id, x, y }) => ({ id, x, y }))).toEqual(
      DEFAULT_WORLD.locations.map(({ id, x, y }) => ({ id, x, y })),
    );
    expect(mapPresentationError(w.mapPresentation)).toBeNull();
  });
  it("rejects unordered, nonfinite, missing, and oversized settings", () => {
    for (const change of [
      (p: typeof DEFAULT_MAP_PRESENTATION) => {
        p.minZoom = 4;
        p.maxZoom = 2;
      },
      (p: typeof DEFAULT_MAP_PRESENTATION) => {
        p.defaultZoom = 8;
      },
      (p: typeof DEFAULT_MAP_PRESENTATION) => {
        p.icons.city.size = Infinity;
      },
      (p: typeof DEFAULT_MAP_PRESENTATION) => {
        p.icons.town.minSize = 150;
      },
      (p: typeof DEFAULT_MAP_PRESENTATION) => {
        p.icons.village.labelMinZoom = 6;
        p.icons.village.labelMaxZoom = 2;
      },
    ]) {
      const p = structuredClone(DEFAULT_MAP_PRESENTATION);
      change(p);
      expect(mapPresentationError(p)).toBeTruthy();
    }
    expect(mapPresentationError({})).toBeTruthy();
  });
  it("keeps fixed sizes stable and gradual scaling clamped, with separate labels", () => {
    const fixed = DEFAULT_MAP_PRESENTATION.icons.character;
    expect(iconPresentation(fixed, -1).size).toBe(
      iconPresentation(fixed, 7).size,
    );
    const city = { ...DEFAULT_MAP_PRESENTATION.icons.city, labelMinZoom: 2 };
    expect(iconPresentation(city, 0).visible).toBe(true);
    expect(iconPresentation(city, 0).label).toBe(false);
    expect(iconPresentation(city, 2).label).toBe(true);
    expect(iconPresentation(city, -4).size).toBe(city.minSize);
    expect(iconPresentation(city, 7).size).toBe(city.maxSize);
    expect(
      iconPresentation(DEFAULT_MAP_PRESENTATION.icons.kingdom, 3).visible,
    ).toBe(false);
  });
});
