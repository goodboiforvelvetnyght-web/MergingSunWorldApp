import {
  DEFAULT_MAP_PRESENTATION,
  type MapPresentation,
} from "./mapPresentation.js";
import { normalizeTile, type StoredWorld } from "./tileStorage.js";
import {
  DEFAULT_TRAVEL_RULES,
  DEFAULT_SAILING_COST,
  type TravelRules,
  type TerrainType,
  type TerrainFeature,
} from "./travelRules.js";
import {
  WIDTH,
  HEIGHT,
  LAND,
  ISLANDS,
  FORESTS,
  MOUNTAINS,
  RIVER,
} from "./geography.js";
export { WIDTH, HEIGHT };
export { normalizeTile } from "./tileStorage.js";
export const MIN_HEX_RADIUS = 8;
export const MAX_HEX_RADIUS = 128;
export const MAX_WORLD_TILES = 40000;
// Legacy names remain accepted when loading older maps. tileAt returns canonical tiles.
export type Terrain = TerrainType | "forest" | "mountain" | "water";
export type Point = { x: number; y: number };
export type BorderPoint = Point & { sharp?: boolean };
export type Hex = { q: number; r: number };
export type Tile = {
  terrain: Terrain;
  features?: Exclude<TerrainFeature, "river">[];
  river: boolean;
  road?: boolean;
};
export type NormalizedTile = Tile & {
  terrain: TerrainType;
  features: Exclude<TerrainFeature, "river">[];
};
export function paintFeature(
  tile: Tile,
  feature: TerrainFeature,
  add: boolean,
): NormalizedTile {
  const next = normalizeTile(tile);
  if (feature === "river") return { ...next, river: add };
  const features = new Set(next.features);
  if (add) {
    features.add(feature);
    if (feature === "mountain") features.delete("hills");
    if (feature === "hills") features.delete("mountain");
  } else features.delete(feature);
  return { ...next, features: [...features].sort() };
}
export type PlaceEntry = {
  id: string;
  name: string;
  summary: string;
  lore: string;
};
export type Location = {
  id: string;
  name: string;
  kind: "city" | "town" | "village" | "landmark";
  kingdomId: string | null;
  entries: PlaceEntry[];
  x: number;
  y: number;
  region: string;
  summary: string;
  lore: string;
  starting: boolean;
  harbour?: boolean;
  coverAssetId?: string | null;
  coverPosition?: number;
};
export type Kingdom = {
  id: string;
  name: string;
  color: string;
  lore: string;
  points: BorderPoint[];
  borderStyle?: "straight" | "smooth";
  emblemAssetId?: string | null;
  emblemPosition?: Point | null;
};
export type World = {
  schemaVersion: 2;
  travelRules?: TravelRules;
  mapPresentation?: MapPresentation;
  mapAssetId?: string | null;
  mapNativeZoom?: number;
  mapWidth?: number;
  mapHeight?: number;
  mapLayout?: "natural";
  terrainBase?: "water";
  /** Draft-only alignment; the server strips this after migrating characters. */
  mapAlignment?: { baseVersion: number; mode: "fit" | "unpad" };
  version: number;
  radius: number;
  offsetX: number;
  offsetY: number;
  tiles: Record<string, Tile>;
  locations: Location[];
  territories: Kingdom[];
};
export type Character = {
  originLocationId: string | null;
  currentLocationId?: string | null;
  internalLocationId?: string | null;
  incarnationId?: string;
  hexKey?: string;
  realName?: string;
  portrait?: string;
  portraitPath?: string;
  approvedAt?: number;
  name: string;
  title: string;
  bio: string;
  x: number;
  y: number;
  energy: number;
  energyAt: number;
  createdAt: number;
};
export type CharacterCreationData = {
  name: string;
  title: string;
  bio: string;
  locationId: string;
  realName: string;
  portrait: string;
  requestId: string;
  replace: boolean;
  expectedGeneration: string | null;
  expectedApplicationId?: string | null;
};
export const characterGeneration = (c: Character) =>
  c.incarnationId ?? `legacy-${c.createdAt}`;
export type Journey = {
  id: string;
  from: string;
  to: string;
  cost: number;
  at: number;
};
export const MAX_ENERGY = 100;
export const REGEN_MS = 5 * 60 * 1000;
export const KM_PER_HEX = 5;
export const TERRAIN_COLORS: Record<Terrain, string> = {
  plains: "#c7c58c",
  desert: "#d5af69",
  tundra: "#a0a798",
  snow: "#e8edef",
  coast: "#68c4ce",
  ocean: "#537baf",
  forest: "#58745c",
  mountain: "#9b8c7d",
  water: "#88aeb4",
};
export const key = (h: Hex) => `${h.q},${h.r}`;
export function center(
  h: Hex,
  w: Pick<World, "radius" | "offsetX" | "offsetY">,
): Point {
  return {
    x: w.offsetX + w.radius * Math.sqrt(3) * (h.q + h.r / 2),
    y: w.offsetY + w.radius * 1.5 * h.r,
  };
}
export function hexAt(
  p: Point,
  w: Pick<World, "radius" | "offsetX" | "offsetY">,
): Hex {
  const x = p.x - w.offsetX,
    y = p.y - w.offsetY,
    q = ((Math.sqrt(3) / 3) * x - y / 3) / w.radius,
    r = (2 * y) / 3 / w.radius;
  let a = Math.round(q),
    b = Math.round(r),
    c = Math.round(-q - r);
  const da = Math.abs(a - q),
    db = Math.abs(b - r),
    dc = Math.abs(c + q + r);
  if (da > db && da > dc) a = -b - c;
  else if (db > dc) b = -a - c;
  return { q: a || 0, r: b || 0 };
}
export function corners(h: Hex, w: World): Point[] {
  const p = center(h, w);
  return Array.from({ length: 6 }, (_, i) => ({
    x: p.x + w.radius * Math.cos(((60 * i - 30) * Math.PI) / 180),
    y: p.y + w.radius * Math.sin(((60 * i - 30) * Math.PI) / 180),
  }));
}
export function inside(p: Point, poly: [number, number][]): boolean {
  let result = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j];
    if (
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi
    )
      result = !result;
  }
  return result;
}
export function isLand(p: Point): boolean {
  return inside(p, LAND) || ISLANDS.some((poly) => inside(p, poly));
}
function inEllipse(
  p: Point,
  e: { x: number; y: number; rx: number; ry: number },
) {
  return ((p.x - e.x) / e.rx) ** 2 + ((p.y - e.y) / e.ry) ** 2 < 1;
}
function lineDistance(p: Point, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / (dx * dx + dy * dy),
      ),
    );
  return Math.hypot(p.x - a[0] - t * dx, p.y - a[1] - t * dy);
}
export function baseTile(p: Point, radius: number): Tile {
  const terrain: Terrain = !isLand(p)
    ? "water"
    : MOUNTAINS.some((e) => inEllipse(p, e))
      ? "mountain"
      : FORESTS.some((e) => inEllipse(p, e))
        ? "forest"
        : "plains";
  return {
    terrain,
    river:
      terrain !== "water" &&
      RIVER.slice(1).some(
        (b, i) => lineDistance(p, RIVER[i], b) < radius * 0.48,
      ),
  };
}
export const tileAt = (h: Hex, w: World): NormalizedTile =>
  normalizeTile(
    w.tiles[key(h)] ??
      (w.terrainBase === "water"
        ? { terrain: "water", river: false, road: false }
        : baseTile(center(h, w), w.radius)),
  );
export function worldSize(w: Pick<World, "mapWidth" | "mapHeight">) {
  return { width: w.mapWidth ?? WIDTH, height: w.mapHeight ?? HEIGHT };
}
export function tileTravelCost(tile: Tile, world?: Pick<World, "travelRules">) {
  const t = normalizeTile(tile),
    rules = world?.travelRules ?? DEFAULT_TRAVEL_RULES;
  const rows = [
    { id: t.terrain, rule: rules.terrain[t.terrain] },
    ...[...t.features, ...(t.river ? ["river" as const] : [])].map((id) => ({
      id,
      rule: rules.features[id],
    })),
  ];
  const blocked = rows.some(
    ({ rule }) =>
      rule.walking === "blocked" ||
      (rule.walking === "road-required" && !t.road),
  );
  const passageOnly = rows.some(({ rule }) => rule.road === "passage-only");
  const costs: Record<string, number> = {};
  let savings = 0;
  for (const { id, rule } of rows) {
    const discount =
      t.road && !passageOnly && rule.road === "discount" ? 0.5 : 1;
    costs[id] = rule.cost * discount;
    savings += rule.cost * (1 - discount);
  }
  return {
    cost: blocked ? Infinity : Object.values(costs).reduce((a, b) => a + b, 0),
    costs,
    savings,
  };
}
export const entryCost = (tile: Tile, world?: Pick<World, "travelRules">) =>
  tileTravelCost(tile, world).cost;
export function inBounds(h: Hex, w: World) {
  const p = center(h, w);
  const { width, height } = worldSize(w);
  return (
    p.x >= -1e-7 && p.y >= -1e-7 && p.x <= width + 1e-7 && p.y <= height + 1e-7
  );
}
export function allHexes(w: World): Hex[] {
  const list: Hex[] = [],
    { width, height } = worldSize(w);
  const rMin = Math.floor(-w.offsetY / (w.radius * 1.5)) - 1;
  const rMax = Math.ceil((height - w.offsetY) / (w.radius * 1.5)) + 1;
  for (let r = rMin; r <= rMax; r++) {
    const qMin = Math.floor(-w.offsetX / (w.radius * Math.sqrt(3)) - r / 2) - 1;
    const qMax =
      Math.ceil((width - w.offsetX) / (w.radius * Math.sqrt(3)) - r / 2) + 1;
    for (let q = qMin; q <= qMax; q++)
      if (inBounds({ q, r }, w)) list.push({ q, r });
  }
  return list;
}
export function neighbors(h: Hex): Hex[] {
  return [
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
  ].map(([q, r]) => ({ q: h.q + q, r: h.r + r }));
}
export function brushHexes(h: Hex, size: number, w: World): Hex[] {
  const cells: Hex[] = [],
    range = Math.max(0, Math.min(2, Math.floor(size) - 1));
  for (let q = -range; q <= range; q++)
    for (
      let r = Math.max(-range, -q - range);
      r <= Math.min(range, -q + range);
      r++
    ) {
      const cell = { q: h.q + q, r: h.r + r };
      if (inBounds(cell, w)) cells.push(cell);
    }
  return cells;
}
export const hexDistance = (a: Hex, b: Hex) =>
  (Math.abs(a.q - b.q) +
    Math.abs(a.q + a.r - b.q - b.r) +
    Math.abs(a.r - b.r)) /
  2;
export type Route = {
  path: Hex[];
  cost: number;
  steps: number;
  riverEntries: number;
  rawCost: number;
  roadSavings: number;
  rounding: number;
  terrainCosts: Partial<Record<Terrain, number>>;
  featureCosts: Partial<Record<TerrainFeature, number>>;
};
type FrontierEntry = { h: Hex; cost: number; score: number; order: number };
class RouteFrontier {
  entries: FrontierEntry[] = [];
  private before(a: FrontierEntry, b: FrontierEntry) {
    return a.score < b.score || (a.score === b.score && a.order < b.order);
  }
  push(entry: FrontierEntry) {
    const list = this.entries;
    let i = list.length;
    list.push(entry);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.before(entry, list[parent])) break;
      list[i] = list[parent];
      i = parent;
    }
    list[i] = entry;
  }
  pop(): FrontierEntry {
    const list = this.entries,
      result = list[0],
      last = list.pop()!;
    if (list.length) {
      let i = 0;
      while (i * 2 + 1 < list.length) {
        let child = i * 2 + 1;
        if (
          child + 1 < list.length &&
          this.before(list[child + 1], list[child])
        )
          child++;
        if (!this.before(list[child], last)) break;
        list[i] = list[child];
        i = child;
      }
      list[i] = last;
    }
    return result;
  }
}
export function findRoute(start: Hex, end: Hex, w: World): Route | null {
  if (
    !inBounds(start, w) ||
    !inBounds(end, w) ||
    !Number.isFinite(entryCost(tileAt(end, w), w))
  )
    return null;
  const startKey = key(start),
    endKey = key(end),
    frontier = new RouteFrontier(),
    g = new Map<string, number>([[startKey, 0]]),
    previous = new Map<string, Hex>(),
    visited = new Set<string>();
  let order = 0;
  frontier.push({
    h: start,
    cost: 0,
    score: hexDistance(start, end) * 0.5,
    order: order++,
  });
  while (frontier.entries.length && visited.size < MAX_WORLD_TILES) {
    const entry = frontier.pop(),
      current = entry.h,
      ck = key(current);
    if (visited.has(ck) || entry.cost !== g.get(ck)) continue;
    visited.add(ck);
    if (ck === endKey) {
      const path = [current];
      while (key(path[0]) !== startKey)
        path.unshift(previous.get(key(path[0]))!);
      const terrainCosts: Partial<Record<Terrain, number>> = {};
      const featureCosts: Partial<Record<TerrainFeature, number>> = {};
      let riverEntries = 0,
        roadSavings = 0;
      for (const h of path.slice(1)) {
        const t = tileAt(h, w),
          details = tileTravelCost(t, w);
        terrainCosts[t.terrain] =
          (terrainCosts[t.terrain] ?? 0) + details.costs[t.terrain];
        for (const f of [...t.features, ...(t.river ? ["river" as const] : [])])
          featureCosts[f] = (featureCosts[f] ?? 0) + details.costs[f];
        roadSavings += details.savings;
        if (t.river) riverEntries++;
      }
      return {
        path,
        cost: Math.ceil(g.get(ck)!),
        rawCost: g.get(ck)!,
        roadSavings,
        rounding: Math.ceil(g.get(ck)!) - g.get(ck)!,
        steps: path.length - 1,
        riverEntries,
        terrainCosts,
        featureCosts,
      };
    }
    for (const n of neighbors(current)) {
      if (!inBounds(n, w)) continue;
      const cost = entryCost(tileAt(n, w), w);
      if (!Number.isFinite(cost)) continue;
      const nk = key(n),
        next = g.get(ck)! + cost;
      if (next < (g.get(nk) ?? Infinity)) {
        g.set(nk, next);
        previous.set(nk, current);
        frontier.push({
          h: n,
          cost: next,
          score: next + hexDistance(n, end) * 0.5,
          order: order++,
        });
      }
    }
  }
  return null;
}
export function energyNow(c: Character, now = Date.now()) {
  return Math.min(
    MAX_ENERGY,
    c.energy + Math.floor(Math.max(0, now - c.energyAt) / REGEN_MS),
  );
}
export function spendEnergy(
  c: Character,
  cost: number,
  now = Date.now(),
): Pick<Character, "energy" | "energyAt"> {
  const available = energyNow(c, now);
  if (!Number.isSafeInteger(cost) || cost < 0 || cost > available)
    throw new Error("Not enough energy.");
  const ticks = Math.floor(Math.max(0, now - c.energyAt) / REGEN_MS);
  return {
    energy: available - cost,
    energyAt: available === MAX_ENERGY ? now : c.energyAt + ticks * REGEN_MS,
  };
}
export const DEFAULT_WORLD: World = {
  schemaVersion: 2,
  version: 0,
  radius: 42,
  offsetX: 0,
  offsetY: 0,
  tiles: {},
  locations: [
    {
      id: "emberfall",
      kingdomId: "reach",
      entries: [
        {
          id: "copper-stag",
          name: "The Copper Stag",
          summary: "A welcoming inn for the road-weary.",
          lore: "<p>A fire burns in the hearth, and there is always room for another story.</p>",
        },
      ],
      name: "Emberfall",
      kind: "city",
      x: 1090,
      y: 945,
      region: "The Sunward Reach",
      summary: "Where every road becomes a story.",
      starting: true,
      lore: "<h2>The city of a thousand hearths</h2><p>At the meeting of the old trade roads stands Emberfall, a city of warm sandstone, copper rooftops, and doors that rarely close to a traveler.</p><p>Its lanterns are lit at dusk by the Keepers of the Last Light. They say that as long as a single flame remains, no soul in the Reach is truly lost.</p><blockquote>“Come as a stranger. Leave with a story.”<br>— Inscription above the western gate</blockquote><h3>Places to discover</h3><ul><li><strong>The Hearthmarket:</strong> spices, secrets, and something you did not know you needed.</li><li><strong>The Sunken Archive:</strong> centuries of stories beneath the old bell tower.</li><li><strong>The Copper Stag:</strong> a welcoming inn for the road-weary.</li></ul><p><em>Sample lore · Replace this story with your own world.</em></p>",
    },
    {
      id: "thornwatch",
      kingdomId: "reach",
      entries: [],
      name: "Thornwatch",
      kind: "town",
      x: 735,
      y: 760,
      region: "The Elderwood",
      summary: "A quiet refuge beneath an ancient canopy.",
      starting: true,
      lore: "<h2>At the edge of the Elderwood</h2><p>Thornwatch was built around a living oak whose roots are older than the kingdom. Hunters and herbalists share its winding paths with those seeking a quieter life.</p><p>The forest is generous to those who listen, and less forgiving to those who take.</p><h3>The wardens</h3><p>Green-cloaked wardens guide visitors through the woods. Their waymarkers are carved leaves, never arrows.</p><p><em>Sample lore for the placeholder world.</em></p>",
    },
    {
      id: "highmere",
      kingdomId: "reach",
      entries: [],
      name: "Highmere",
      kind: "town",
      x: 1110,
      y: 340,
      region: "The Ashen Peaks",
      summary: "An outpost above the clouds.",
      starting: false,
      lore: "<h2>The northern watch</h2><p>Highmere guards the passes through the Ashen Peaks. Its stone halls offer shelter to the stubborn souls who cross the mountains.</p><blockquote>The mountain does not hurry. Neither should you.</blockquote><p><em>Sample lore for the placeholder world.</em></p>",
    },
    {
      id: "sunspire",
      kingdomId: "coast",
      entries: [],
      name: "Sunspire",
      kind: "city",
      x: 1750,
      y: 785,
      region: "The Golden Coast",
      summary: "White towers watching the eastern sea.",
      starting: true,
      lore: "<h2>Where the morning arrives first</h2><p>Sunspire’s white towers catch the dawn before the fishing boats return. Scholars, merchants, and pilgrims fill its sunlit courtyards.</p><h3>The observatory</h3><p>At the city’s highest point, a great bronze instrument follows the wandering stars.</p><p><em>Sample lore for the placeholder world.</em></p>",
    },
    {
      id: "mossveil",
      kingdomId: "reach",
      entries: [],
      name: "Mossveil",
      kind: "town",
      x: 870,
      y: 1270,
      region: "The Whispering Vale",
      summary: "A riverside village with long memories.",
      starting: false,
      lore: "<h2>Along the quiet waters</h2><p>Waterwheels turn slowly in Mossveil. Its people make paper, mend boats, and remember the names of everyone who has crossed their bridge.</p><p><em>Sample lore for the placeholder world.</em></p>",
    },
    {
      id: "hollow",
      kingdomId: "coast",
      entries: [],
      name: "The Hollow Sanctum",
      kind: "landmark",
      x: 1600,
      y: 1200,
      region: "The Elderwood",
      summary: "Old stones. Unanswered questions.",
      starting: false,
      lore: "<h2>A place beyond remembering</h2><p>Seven standing stones surround a shallow basin. No inscription survives, yet visitors often leave with the feeling that something has been said.</p><p><em>Sample lore for the placeholder world.</em></p>",
    },
  ],
  territories: [
    {
      id: "coast",
      name: "The Golden Coast",
      color: "#588b96",
      lore: "<p>A coastal kingdom of white towers and sea roads.</p>",
      points: [
        { x: 1550, y: 650 },
        { x: 2050, y: 650 },
        { x: 2100, y: 1250 },
        { x: 1600, y: 1350 },
      ],
    },
    {
      id: "reach",
      name: "The Sunward Reach",
      color: "#b58d4f",
      lore: "<p>A realm of old roads and welcoming hearths.</p>",
      points: [
        { x: 840, y: 650 },
        { x: 1320, y: 650 },
        { x: 1550, y: 820 },
        { x: 1500, y: 1230 },
        { x: 1150, y: 1400 },
        { x: 800, y: 1100 },
      ],
    },
  ],
};
export function makeCharacter(
  name: string,
  title: string,
  bio: string,
  location: Location,
  w: World,
  now = Date.now(),
): Character {
  const p = center(hexAt(location, w), w);
  return {
    originLocationId: location.id,
    currentLocationId: null,
    internalLocationId: null,
    name,
    title,
    bio,
    ...p,
    energy: MAX_ENERGY,
    energyAt: now,
    createdAt: now,
  };
}
export function nearestLocation(p: Point, w: World) {
  return [...w.locations].sort(
    (a, b) =>
      Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y),
  )[0];
}
export function locationLabel(p: Point, w: World) {
  const n = nearestLocation(p, w);
  return n && hexDistance(hexAt(n, w), hexAt(p, w)) <= 1
    ? n.name
    : `${tileAt(hexAt(p, w), w).terrain} · ${key(hexAt(p, w))}`;
}

/** Upgrade legacy worlds without guessing allegiance from geometry or dropping lore. */
export function normalizeWorld(input: World | StoredWorld): World {
  const territories = (input.territories ?? []).map((k) => ({
    ...k,
    lore: k.lore ?? "",
  }));
  return {
    ...input,
    schemaVersion: 2,
    mapPresentation: structuredClone(
      input.mapPresentation ?? DEFAULT_MAP_PRESENTATION,
    ),
    travelRules: structuredClone(input.travelRules ?? DEFAULT_TRAVEL_RULES),
    tiles: Object.fromEntries(
      Object.entries(input.tiles).map(([k, t]) => [k, normalizeTile(t)]),
    ),
    territories,
    locations: input.locations.map((l) => {
      const kingdomId =
        l.kingdomId === undefined
          ? (territories.find((k) => k.name === l.region)?.id ?? null)
          : l.kingdomId;
      return {
        ...l,
        kingdomId,
        entries: l.entries ?? [],
        region: territories.find((k) => k.id === kingdomId)?.name ?? l.region,
      };
    }),
  };
}
export function removeKingdom(world: World, id: string): World {
  return {
    ...world,
    territories: world.territories.filter((k) => k.id !== id),
    locations: world.locations.filter((l) => l.kingdomId !== id),
  };
}
/** Deletions clear references, but never move a character or change their energy. */
export function characterAfterWorldChange(
  c: Character,
  world: World,
  geometryChanged: boolean,
): Character {
  const origin = world.locations.find((l) => l.id === c.originLocationId);
  const result: Character = { ...c, originLocationId: origin?.id ?? null };
  if (
    c.currentLocationId &&
    !world.locations.some((l) => l.id === c.currentLocationId)
  )
    result.currentLocationId = null;
  if (
    c.internalLocationId &&
    !world.locations.some(
      (l) =>
        l.id === result.currentLocationId &&
        internalLocations(l).some((e) => e.id === c.internalLocationId),
    )
  )
    result.internalLocationId = null;
  if (geometryChanged && origin)
    Object.assign(result, center(hexAt(origin, world), world), {
      currentLocationId: null,
      internalLocationId: null,
    });
  else if (
    result.currentLocationId &&
    physicalSettlement(result, world) !== result.currentLocationId
  )
    Object.assign(result, {
      currentLocationId: null,
      internalLocationId: null,
    });
  return result;
}

export type CharacterApplication = {
  id: string;
  status: "pending" | "approved" | "rejected";
  candidate: Character;
  expectedGeneration: string | null;
  submittedAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
  rejectionReason?: string;
};
export type PublicCharacter = Pick<
  Character,
  "name" | "title" | "bio" | "originLocationId"
> & { uid: string; hasPortrait: boolean };
export function commonsId(locationId: string) {
  return `commons-${locationId}`;
}
export function internalLocations(location: Location): PlaceEntry[] {
  return [
    {
      id: commonsId(location.id),
      name: "Town Commons",
      summary: "The gathering place for travelers and residents.",
      lore: "<p>A place to meet the people of this settlement.</p>",
    },
    ...location.entries,
  ];
}
export function physicalSettlement(c: Character, w: World): string | null {
  if (c.currentLocationId) {
    const l = w.locations.find((l) => l.id === c.currentLocationId);
    if (l && key(hexAt(l, w)) === key(hexAt(c, w))) return l.id;
  }
  return (
    w.locations.find((l) => key(hexAt(l, w)) === key(hexAt(c, w)))?.id ?? null
  );
}
/** Explicit city presence is separate from standing on a settlement's hex. */
export function enteredSettlement(c: Character, w: World): string | null {
  return c.currentLocationId && physicalSettlement(c, w) === c.currentLocationId
    ? c.currentLocationId
    : null;
}
export function populationCounts(
  characters: Character[],
  w: World,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of characters) {
    const id = enteredSettlement(c, w);
    if (id) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/** Sailing is a flat-cost city transfer, independent of walking routes. */
export function sailingCost(w: World): number {
  return w.travelRules?.sailingCost ?? DEFAULT_SAILING_COST;
}
export function sailCharacter(
  c: Character,
  w: World,
  fromId: string,
  toId: string,
  now = Date.now(),
): Character {
  const from = w.locations.find((l) => l.id === fromId);
  const to = w.locations.find((l) => l.id === toId);
  if (
    !from?.harbour ||
    from.kind === "landmark" ||
    enteredSettlement(c, w) !== from.id
  )
    throw new Error("Enter your departure city with a harbour before sailing.");
  if (!to?.harbour || to.kind === "landmark" || to.id === from.id)
    throw new Error("Choose another settlement with a harbour.");
  if (!inBounds(hexAt(to, w), w))
    throw new Error("This harbour is outside the map grid.");
  return {
    ...c,
    ...center(hexAt(to, w), w),
    ...spendEnergy(c, sailingCost(w), now),
    currentLocationId: to.id,
    internalLocationId: null,
  };
}

/** Tile presence includes everyone, regardless of city/room presence or online status. */
export function hexPopulationCounts(
  characters: Character[],
  w: World,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of characters) {
    const id = key(hexAt(c, w));
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}
export function sameCharacterHex(a: Point, b: Point, w: World): boolean {
  return key(hexAt(a, w)) === key(hexAt(b, w));
}
