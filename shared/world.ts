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
export type Terrain = "plains" | "forest" | "mountain" | "water";
export type Point = { x: number; y: number };
export type Hex = { q: number; r: number };
export type Tile = { terrain: Terrain; river: boolean; road?: boolean };
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
};
export type Kingdom = {
  id: string;
  name: string;
  color: string;
  lore: string;
  points: Point[];
  emblemAssetId?: string | null;
  emblemPosition?: Point | null;
};
export type World = {
  schemaVersion: 2;
  mapAssetId?: string | null;
  mapNativeZoom?: number;
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
export const COSTS: Record<Terrain, number> = {
  plains: 2,
  forest: 4,
  mountain: 7,
  water: Infinity,
};
export const RIVER_COST = 3;
export const TERRAIN_COLORS: Record<Terrain, string> = {
  plains: "#c7c58c",
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
export const tileAt = (h: Hex, w: World): Tile =>
  w.tiles[key(h)] ?? baseTile(center(h, w), w.radius);
export const entryCost = (t: Tile) =>
  COSTS[t.terrain] * (t.road ? 0.5 : 1) + (t.river ? RIVER_COST : 0);
export function inBounds(h: Hex, w: World) {
  const p = center(h, w);
  return p.x >= 0 && p.y >= 0 && p.x <= WIDTH && p.y <= HEIGHT;
}
export function allHexes(w: World): Hex[] {
  const list: Hex[] = [];
  for (let r = -2; r <= Math.ceil(HEIGHT / (w.radius * 1.5)) + 2; r++)
    for (
      let q = -Math.ceil(HEIGHT / w.radius);
      q <= Math.ceil(WIDTH / (w.radius * Math.sqrt(3))) + 2;
      q++
    ) {
      const h = { q, r };
      if (inBounds(h, w)) list.push(h);
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
  terrainCosts: Record<Terrain, number>;
};
export function findRoute(start: Hex, end: Hex, w: World): Route | null {
  if (
    !inBounds(start, w) ||
    !inBounds(end, w) ||
    !Number.isFinite(entryCost(tileAt(end, w)))
  )
    return null;
  const startKey = key(start),
    endKey = key(end),
    open = new Map<string, Hex>([[startKey, start]]),
    g = new Map<string, number>([[startKey, 0]]),
    previous = new Map<string, Hex>();
  let iterations = 0;
  while (open.size && iterations++ < 10000) {
    let current = start,
      best = Infinity;
    for (const [k, h] of open) {
      const score = g.get(k)! + hexDistance(h, end);
      if (score < best) {
        best = score;
        current = h;
      }
    }
    const ck = key(current);
    open.delete(ck);
    if (ck === endKey) {
      const path = [current];
      while (key(path[0]) !== startKey)
        path.unshift(previous.get(key(path[0]))!);
      const terrainCosts: Record<Terrain, number> = {
        plains: 0,
        forest: 0,
        mountain: 0,
        water: 0,
      };
      let riverEntries = 0,
        roadSavings = 0;
      for (const h of path.slice(1)) {
        const t = tileAt(h, w);
        terrainCosts[t.terrain] += COSTS[t.terrain] * (t.road ? 0.5 : 1);
        if (t.road) roadSavings += COSTS[t.terrain] * 0.5;
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
      };
    }
    for (const n of neighbors(current)) {
      if (!inBounds(n, w)) continue;
      const cost = entryCost(tileAt(n, w));
      if (!Number.isFinite(cost)) continue;
      const nk = key(n),
        next = g.get(ck)! + cost;
      if (next < (g.get(nk) ?? Infinity)) {
        g.set(nk, next);
        previous.set(nk, current);
        open.set(nk, n);
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
export function normalizeWorld(input: World): World {
  const territories = (input.territories ?? []).map((k) => ({
    ...k,
    lore: k.lore ?? "",
  }));
  return {
    ...input,
    schemaVersion: 2,
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
      currentLocationId: origin.id,
      internalLocationId: commonsId(origin.id),
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
export function populationCounts(
  characters: Character[],
  w: World,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of characters) {
    const id = physicalSettlement(c, w);
    if (id) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}
