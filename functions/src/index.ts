import { db } from "./firebase.js";
import { requireAdmin } from "./adminInvitations.js";
export {
  generateAdminInvitation,
  redeemAdminInvitation,
  revokeAdminInvitation,
} from "./adminInvitations.js";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import {
  DEFAULT_WORLD,
  normalizeWorld,
  characterAfterWorldChange,
  makeCharacter,
  characterGeneration,
  findRoute,
  hexAt,
  center,
  spendEnergy,
  tileAt,
  entryCost,
  locationLabel,
  type World,
  type Character,
} from "../../shared/world.js";
setGlobalOptions({
  region: "asia-southeast1",
  maxInstances: 5,
  serviceAccount: "merging-sun-runtime@mergingsunapp-2.iam.gserviceaccount.com",
});
const worldRef = db.doc("worlds/main");
function textField(
  value: unknown,
  name: string,
  max: number,
  required = true,
): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new HttpsError("invalid-argument", `Invalid ${name}.`);
  return value.trim();
}
function point(v: unknown): v is { x: number; y: number } {
  return (
    !!v &&
    typeof v === "object" &&
    "x" in v &&
    "y" in v &&
    typeof v.x === "number" &&
    typeof v.y === "number" &&
    Number.isFinite(v.x) &&
    Number.isFinite(v.y) &&
    v.x >= 0 &&
    v.x <= 2400 &&
    v.y >= 0 &&
    v.y <= 1800
  );
}
function portraitField(value: unknown): string {
  if (value === undefined || value === "") return "";
  if (typeof value !== "string" || value.length > 220000)
    throw new HttpsError(
      "invalid-argument",
      "The portrait must be a small JPEG, PNG, or WebP image.",
    );
  const match =
    /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match)
    throw new HttpsError("invalid-argument", "Invalid portrait format.");
  const bytes = Buffer.from(match[2], "base64");
  const valid =
    match[1] === "jpeg"
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : match[1] === "png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes.toString("ascii", 0, 4) === "RIFF" &&
          bytes.toString("ascii", 8, 12) === "WEBP";
  if (!valid || bytes.toString("base64") !== match[2])
    throw new HttpsError("invalid-argument", "Invalid portrait image.");
  return value;
}
export const createCharacter = onCall(async (request) => {
  if (!request.auth)
    throw new HttpsError("unauthenticated", "Sign in to create a character.");
  const data = request.data ?? {},
    name = textField(data.name, "name", 40),
    title = textField(data.title ?? "", "title", 60, false),
    bio = textField(data.bio ?? "", "backstory", 1500, false),
    realName = textField(data.realName, "real name", 100),
    portrait = portraitField(data.portrait),
    locationId = textField(data.locationId, "starting location", 80),
    requestId = data.requestId;
  if (
    typeof requestId !== "string" ||
    !/^[\w-]{16,80}$/.test(requestId) ||
    (data.replace !== undefined && typeof data.replace !== "boolean")
  )
    throw new HttpsError(
      "invalid-argument",
      "Invalid character creation request.",
    );
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`characters/${request.auth!.uid}`);
    const [existing, ws] = await Promise.all([tx.get(ref), tx.get(worldRef)]);
    const previous = existing.exists ? (existing.data() as Character) : null;
    if (previous?.incarnationId === requestId) return previous;
    if (previous && data.replace !== true)
      throw new HttpsError("already-exists", "You already have a character.");
    if (
      data.replace === true &&
      (!previous || data.expectedGeneration !== characterGeneration(previous))
    )
      throw new HttpsError(
        "failed-precondition",
        "Your character changed. Reload before recreating it.",
      );
    if (previous) {
      const archived = await tx.get(
        ref.collection("incarnations").doc(requestId),
      );
      if (archived.exists)
        throw new HttpsError(
          "failed-precondition",
          "This creation request belongs to an older character. Start a fresh character draft.",
        );
    }
    const w = normalizeWorld((ws.data() ?? DEFAULT_WORLD) as World);
    const location = w.locations.find(
      (l) =>
        l.id === locationId &&
        l.starting &&
        l.kingdomId &&
        w.territories.some((k) => k.id === l.kingdomId),
    );
    if (!location || !Number.isFinite(entryCost(tileAt(hexAt(location, w), w))))
      throw new HttpsError(
        "failed-precondition",
        "Choose a walkable starting settlement belonging to a kingdom.",
      );
    const c: Character = {
      ...makeCharacter(name, title, bio, location, w),
      realName,
      portrait,
      incarnationId: requestId,
      currentLocationId: location.id,
      internalLocationId: null,
    };
    if (previous)
      tx.set(
        ref.collection("incarnations").doc(characterGeneration(previous)),
        previous,
      );
    tx.set(ref, c);
    return c;
  });
});
export const travel = onCall(async (request) => {
  if (!request.auth)
    throw new HttpsError("unauthenticated", "Sign in to travel.");
  const { destination, worldVersion, requestId, generation } =
    request.data ?? {};
  if (
    !point(destination) ||
    !Number.isInteger(worldVersion) ||
    typeof requestId !== "string" ||
    !/^[\w-]{16,80}$/.test(requestId)
  )
    throw new HttpsError("invalid-argument", "Invalid journey.");
  return db.runTransaction(async (tx) => {
    const characterRef = db.doc(`characters/${request.auth!.uid}`);
    const [cs, ws] = await Promise.all([
      tx.get(characterRef),
      tx.get(worldRef),
    ]);
    if (!cs.exists)
      throw new HttpsError("failed-precondition", "Create a character first.");
    const c = cs.data() as Character,
      w = normalizeWorld((ws.data() ?? DEFAULT_WORLD) as World);
    if (
      (c.incarnationId || generation !== undefined) &&
      generation !== characterGeneration(c)
    )
      throw new HttpsError(
        "failed-precondition",
        "Your character changed. Preview your journey again.",
      );
    const journeyRef = c.incarnationId
      ? characterRef
          .collection("incarnations")
          .doc(c.incarnationId)
          .collection("journeys")
          .doc(requestId)
      : characterRef.collection("journeys").doc(requestId);
    const js = await tx.get(journeyRef);
    if (js.exists)
      return { character: c, journey: { id: js.id, ...js.data() } };
    if (w.version !== worldVersion)
      throw new HttpsError(
        "failed-precondition",
        "The world changed. Preview your route again.",
      );
    const route = findRoute(hexAt(c, w), hexAt(destination, w), w);
    if (!route || !route.steps)
      throw new HttpsError(
        "failed-precondition",
        "Choose a reachable destination in another hex.",
      );
    const now = Date.now();
    let energy;
    try {
      energy = spendEnergy(c, route.cost, now);
    } catch {
      throw new HttpsError(
        "failed-precondition",
        "Not enough energy for this journey.",
      );
    }
    const position = center(hexAt(destination, w), w);
    const character = {
      ...c,
      ...position,
      ...energy,
      currentLocationId: null,
      internalLocationId: null,
    };
    const journey = {
      from: locationLabel(c, w),
      to: locationLabel(position, w),
      cost: route.cost,
      at: now,
    };
    tx.set(characterRef, character);
    tx.set(journeyRef, journey);
    return { character, journey: { id: requestId, ...journey } };
  });
});
function validateWorld(input: unknown): World {
  if (!input || typeof input !== "object")
    throw new HttpsError("invalid-argument", "Invalid world.");
  const w = input as World;
  if (
    w.schemaVersion !== 2 ||
    !Number.isInteger(w.version) ||
    w.version < 0 ||
    !Number.isInteger(w.radius) ||
    w.radius < 28 ||
    w.radius > 80 ||
    !Number.isFinite(w.offsetX) ||
    !Number.isFinite(w.offsetY) ||
    Math.abs(w.offsetX) > 80 ||
    Math.abs(w.offsetY) > 80 ||
    !w.tiles ||
    typeof w.tiles !== "object" ||
    Array.isArray(w.tiles) ||
    Object.keys(w.tiles).length > 5000 ||
    !Array.isArray(w.locations) ||
    w.locations.length > 200 ||
    !Array.isArray(w.territories) ||
    w.territories.length > 30
  )
    throw new HttpsError("invalid-argument", "World limits exceeded.");
  const tiles: World["tiles"] = {};
  for (const [k, t] of Object.entries(w.tiles)) {
    if (
      !/^-?\d{1,3},-?\d{1,3}$/.test(k) ||
      !t ||
      !["plains", "forest", "mountain", "water"].includes(t.terrain) ||
      typeof t.river !== "boolean" ||
      (t.road !== undefined && typeof t.road !== "boolean")
    )
      throw new HttpsError("invalid-argument", "Invalid terrain tile.");
    tiles[k] = { terrain: t.terrain, river: t.river, road: t.road ?? false };
  }
  const seen = new Set<string>();
  const uniqueId = (value: unknown, label: string) => {
    const id = textField(value, label, 80);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || seen.has(id))
      throw new HttpsError("invalid-argument", "Place IDs must be unique.");
    seen.add(id);
    return id;
  };
  const territories = w.territories.map((t) => {
    if (
      !t ||
      !/^#[0-9a-fA-F]{6}$/.test(t.color) ||
      !Array.isArray(t.points) ||
      t.points.length < 3 ||
      t.points.length > 150 ||
      !t.points.every(point)
    )
      throw new HttpsError(
        "invalid-argument",
        "Each kingdom needs a border with 3 to 150 points.",
      );
    return {
      id: uniqueId(t.id, "kingdom ID"),
      name: textField(t.name, "kingdom name", 80),
      color: t.color,
      lore: textField(t.lore, "kingdom lore", 60000, false),
      points: t.points.map((p) => ({ x: p.x, y: p.y })),
    };
  });
  const locations = w.locations.map((l) => {
    if (
      !l ||
      !point(l) ||
      !["town", "city", "village", "landmark"].includes(l.kind) ||
      typeof l.starting !== "boolean"
    )
      throw new HttpsError("invalid-argument", "Invalid location.");
    const id = uniqueId(l.id, "settlement ID");
    if (l.kingdomId !== null && !territories.some((k) => k.id === l.kingdomId))
      throw new HttpsError(
        "invalid-argument",
        "Choose an existing kingdom for every settlement.",
      );
    if (!Array.isArray(l.entries) || l.entries.length > 100)
      throw new HttpsError(
        "invalid-argument",
        "A settlement can have up to 100 internal locations.",
      );
    const entries = l.entries.map((e) => {
      if (!e || typeof e !== "object")
        throw new HttpsError("invalid-argument", "Invalid internal location.");
      return {
        id: uniqueId(e.id, "internal location ID"),
        name: textField(e.name, "internal location name", 80),
        summary: textField(e.summary, "summary", 240, false),
        lore: textField(e.lore, "lore", 60000, false),
      };
    });
    return {
      id,
      name: textField(l.name, "location name", 80),
      kind: l.kind,
      kingdomId: l.kingdomId,
      entries,
      x: l.x,
      y: l.y,
      region:
        territories.find((k) => k.id === l.kingdomId)?.name ??
        textField(l.region, "region", 80, false),
      summary: textField(l.summary, "summary", 240, false),
      lore: textField(l.lore, "lore", 60000, false),
      starting: l.starting,
    };
  });
  const clean: World = {
    schemaVersion: 2,
    version: w.version,
    radius: w.radius,
    offsetX: w.offsetX,
    offsetY: w.offsetY,
    tiles,
    locations,
    territories,
  };
  for (const l of locations.filter((l) => l.starting))
    if (!Number.isFinite(entryCost(tileAt(hexAt(l, clean), clean))))
      throw new HttpsError(
        "invalid-argument",
        "Starting settlements must be walkable.",
      );
  if (Buffer.byteLength(JSON.stringify(clean)) > 800000)
    throw new HttpsError(
      "invalid-argument",
      "World is too large. Export and reduce content before publishing.",
    );
  return clean;
}
export const publishWorld = onCall(async (request) => {
  await requireAdmin(request.auth);
  const world = validateWorld(request.data?.world);
  return db.runTransaction(async (tx) => {
    const current = await tx.get(worldRef),
      previous = normalizeWorld((current.data() ?? DEFAULT_WORLD) as World);
    if (previous.version !== world.version)
      throw new HttpsError(
        "failed-precondition",
        "Another admin published changes. Reload the world before editing.",
      );
    const characters = await tx.get(db.collection("characters").limit(401));
    if (characters.size > 400)
      throw new HttpsError(
        "resource-exhausted",
        "This version supports world publishing for up to 400 characters. A batched migration is required for larger worlds.",
      );
    const geometryChanged =
      world.radius !== previous.radius ||
      world.offsetX !== previous.offsetX ||
      world.offsetY !== previous.offsetY;
    const next = { ...world, version: previous.version + 1 };
    // A legacy unassigned place can be kept or assigned, but new independent places are deferred.
    for (const l of world.locations) {
      if (
        l.kingdomId === null &&
        !previous.locations.some(
          (old) => old.id === l.id && old.kingdomId === null,
        )
      )
        throw new HttpsError(
          "invalid-argument",
          "New settlements must belong to a kingdom.",
        );
    }
    for (const doc of characters.docs) {
      const c = doc.data() as Character;
      const updated = characterAfterWorldChange(c, world, geometryChanged);
      if (!Number.isFinite(entryCost(tileAt(hexAt(updated, world), world))))
        throw new HttpsError(
          "failed-precondition",
          "An occupied tile or grid-reset destination cannot become impassable.",
        );
      if (JSON.stringify(updated) !== JSON.stringify(c))
        tx.set(doc.ref, updated);
    }
    tx.set(db.doc(`worldBackups/${previous.version}`), previous);
    tx.set(worldRef, next);
    return next;
  });
});
