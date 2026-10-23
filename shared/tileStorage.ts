import type { Tile, World, NormalizedTile } from "./world.js";
// Storage bit assignments are permanent; changing UI display order must not alter them.
const STORED_TERRAINS = [
  "plains",
  "desert",
  "tundra",
  "snow",
  "coast",
  "ocean",
] as const;
const STORED_FEATURES = ["forest", "hills", "mountain", "marsh"] as const;

export type StoredWorld = Omit<World, "tiles"> & {
  tiles: Record<string, Tile | string>;
};
export function normalizeTile(value: Tile | string): NormalizedTile {
  const tile = decodeTile(value);
  const features = new Set(tile.features ?? []);
  if (tile.terrain === "forest" || tile.terrain === "mountain")
    features.add(tile.terrain);
  if (features.has("mountain")) features.delete("hills");
  return {
    terrain:
      tile.terrain === "water"
        ? "ocean"
        : tile.terrain === "forest" || tile.terrain === "mountain"
          ? "plains"
          : tile.terrain,
    features: [...features].sort(),
    river: tile.river,
    road: tile.road ?? false,
  };
}
/** Two base-36 characters retain terrain, all four land features, river and road. */
export function encodeTile(tile: Tile): string {
  const t = normalizeTile(tile);
  let bits = STORED_TERRAINS.indexOf(t.terrain);
  for (const [i, feature] of STORED_FEATURES.entries())
    if (t.features.includes(feature)) bits |= 1 << (3 + i);
  if (t.river) bits |= 128;
  if (t.road) bits |= 256;
  return bits.toString(36).padStart(2, "0");
}
export function decodeTile(tile: Tile | string): Tile {
  if (typeof tile !== "string") return tile;
  const bits = Number.parseInt(tile, 36),
    terrain = bits & 7;
  if (
    !/^[0-9a-z]{2}$/.test(tile) ||
    bits > 511 ||
    terrain >= STORED_TERRAINS.length ||
    (bits & 16 && bits & 32)
  )
    throw new Error("Invalid compact terrain tile.");
  return {
    terrain: STORED_TERRAINS[terrain],
    features: STORED_FEATURES.filter(
      (_, i) => !!(bits & (1 << (3 + i))),
    ).sort(),
    river: !!(bits & 128),
    road: !!(bits & 256),
  };
}
/** Keep dense grids comfortably below Firestore's document size limit. */
export function serializeWorld(world: World): StoredWorld {
  return {
    ...world,
    tiles: Object.fromEntries(
      Object.entries(world.tiles).map(([id, tile]) => [id, encodeTile(tile)]),
    ),
  };
}
