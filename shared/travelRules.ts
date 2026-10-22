// Bump when code changes travel semantics independently of a published world version.
export const TRAVEL_MODEL_VERSION = 2;
/** Stable definition IDs can also be referenced by future content definitions. */
export const TERRAIN_TYPES = [
  "plains",
  "desert",
  "tundra",
  "snow",
  "coast",
  "ocean",
] as const;
export const FEATURE_TYPES = [
  "forest",
  "hills",
  "mountain",
  "marsh",
  "river",
] as const;
export type TerrainType = (typeof TERRAIN_TYPES)[number];
export type TerrainFeature = (typeof FEATURE_TYPES)[number];
export type TravelRule = {
  cost: number;
  walking: "allowed" | "blocked" | "road-required";
  road: "discount" | "none" | "passage-only";
};
export type TravelRules = {
  terrain: Record<TerrainType, TravelRule>;
  features: Record<TerrainFeature, TravelRule>;
};
const rule = (
  cost: number,
  walking: TravelRule["walking"] = "allowed",
  road: TravelRule["road"] = "discount",
): TravelRule => ({ cost, walking, road });
export const DEFAULT_TRAVEL_RULES: TravelRules = {
  terrain: {
    plains: rule(2),
    desert: rule(4),
    tundra: rule(3),
    snow: rule(5),
    coast: rule(4, "blocked", "none"),
    ocean: rule(6, "blocked", "none"),
  },
  features: {
    forest: rule(2),
    hills: rule(3),
    mountain: rule(18, "road-required", "passage-only"),
    marsh: rule(4),
    river: rule(3, "allowed", "none"),
  },
};
/** Reject malformed rules on both sides before they can change authoritative travel. */
export function travelRulesError(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return "Travel rules are missing.";
  const rules = value as TravelRules;
  if (Object.keys(rules).some((k) => !["terrain", "features"].includes(k)))
    return "Unknown travel rules category.";
  for (const [group, ids] of [
    ["terrain", TERRAIN_TYPES],
    ["features", FEATURE_TYPES],
  ] as const) {
    const rows = rules[group];
    if (
      !rows ||
      typeof rows !== "object" ||
      Array.isArray(rows) ||
      Object.keys(rows).length !== ids.length
    )
      return `Invalid ${group} definitions.`;
    for (const id of ids) {
      const row = (rows as Record<string, TravelRule>)[id];
      if (
        !row ||
        typeof row !== "object" ||
        Object.keys(row).some(
          (k) => !["cost", "walking", "road"].includes(k),
        ) ||
        !Number.isSafeInteger(row.cost) ||
        row.cost < (group === "terrain" ? 1 : 0) ||
        row.cost > 100 ||
        !["allowed", "blocked", "road-required"].includes(row.walking) ||
        !["discount", "none", "passage-only"].includes(row.road)
      )
        return `Invalid ${id} rule. Use whole-number costs ${group === "terrain" ? "1" : "0"}–100 and select walking and road rules.`;
    }
  }
  return null;
}
