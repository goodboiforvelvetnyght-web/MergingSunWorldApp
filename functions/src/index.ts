import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import {
  DEFAULT_WORLD,
  makeCharacter,
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
initializeApp();
setGlobalOptions({
  region: "asia-southeast1",
  maxInstances: 5,
  serviceAccount: "merging-sun-runtime@mergingsunapp-2.iam.gserviceaccount.com",
});
const db = getFirestore();
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
export const createCharacter = onCall(async (request) => {
  if (!request.auth)
    throw new HttpsError("unauthenticated", "Sign in to create a character.");
  const data = request.data ?? {},
    name = textField(data.name, "name", 40),
    title = textField(data.title ?? "", "title", 60, false),
    bio = textField(data.bio ?? "", "biography", 1500, false),
    locationId = textField(data.locationId, "starting location", 80);
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`characters/${request.auth!.uid}`);
    const [existing, ws] = await Promise.all([tx.get(ref), tx.get(worldRef)]);
    if (existing.exists)
      throw new HttpsError("already-exists", "You already have a character.");
    const w = (ws.data() ?? DEFAULT_WORLD) as World;
    const location = w.locations.find((l) => l.id === locationId && l.starting);
    if (!location || !Number.isFinite(entryCost(tileAt(hexAt(location, w), w))))
      throw new HttpsError(
        "failed-precondition",
        "Choose a walkable starting settlement.",
      );
    const c = makeCharacter(name, title, bio, location, w);
    tx.set(ref, c);
    return c;
  });
});
export const travel = onCall(async (request) => {
  if (!request.auth)
    throw new HttpsError("unauthenticated", "Sign in to travel.");
  const { destination, worldVersion, requestId } = request.data ?? {};
  if (
    !point(destination) ||
    !Number.isInteger(worldVersion) ||
    typeof requestId !== "string" ||
    !/^[\w-]{16,80}$/.test(requestId)
  )
    throw new HttpsError("invalid-argument", "Invalid journey.");
  return db.runTransaction(async (tx) => {
    const characterRef = db.doc(`characters/${request.auth!.uid}`),
      journeyRef = characterRef.collection("journeys").doc(requestId);
    const [cs, ws, js] = await Promise.all([
      tx.get(characterRef),
      tx.get(worldRef),
      tx.get(journeyRef),
    ]);
    if (!cs.exists)
      throw new HttpsError("failed-precondition", "Create a character first.");
    if (js.exists)
      return { character: cs.data(), journey: { id: js.id, ...js.data() } };
    const c = cs.data() as Character,
      w = (ws.data() ?? DEFAULT_WORLD) as World;
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
    const character = { ...c, ...position, ...energy };
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
      typeof t.river !== "boolean"
    )
      throw new HttpsError("invalid-argument", "Invalid terrain tile.");
    tiles[k] = { terrain: t.terrain, river: t.river };
  }
  const seen = new Set<string>();
  const locations = w.locations.map((l) => {
    if (
      !l ||
      !point(l) ||
      !["town", "city", "landmark"].includes(l.kind) ||
      typeof l.starting !== "boolean"
    )
      throw new HttpsError("invalid-argument", "Invalid location.");
    const id = textField(l.id, "location ID", 80);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || seen.has(id))
      throw new HttpsError("invalid-argument", "Location IDs must be unique.");
    seen.add(id);
    return {
      id,
      name: textField(l.name, "location name", 80),
      kind: l.kind,
      x: l.x,
      y: l.y,
      region: textField(l.region, "region", 80, false),
      summary: textField(l.summary, "summary", 240, false),
      lore: textField(l.lore, "lore", 60000, false),
      starting: l.starting,
    };
  });
  if (!locations.some((l) => l.starting))
    throw new HttpsError(
      "invalid-argument",
      "Keep at least one starting settlement.",
    );
  const territories = w.territories.map((t) => {
    if (
      !t ||
      !/^#[0-9a-fA-F]{6}$/.test(t.color) ||
      !Array.isArray(t.points) ||
      t.points.length < 3 ||
      t.points.length > 150 ||
      !t.points.every(point)
    )
      throw new HttpsError("invalid-argument", "Invalid territory.");
    return {
      id: textField(t.id, "territory ID", 80),
      name: textField(t.name, "territory name", 80),
      color: t.color,
      points: t.points.map((p) => ({ x: p.x, y: p.y })),
    };
  });
  const clean = {
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
  if (request.auth?.token.admin !== true)
    throw new HttpsError(
      "permission-denied",
      "Only admins can publish the world.",
    );
  const world = validateWorld(request.data?.world);
  return db.runTransaction(async (tx) => {
    const current = await tx.get(worldRef),
      previous = (current.data() ?? DEFAULT_WORLD) as World;
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
    for (const doc of characters.docs) {
      const c = doc.data() as Character;
      const origin = world.locations.find((l) => l.id === c.originLocationId);
      if (!origin)
        throw new HttpsError(
          "failed-precondition",
          "A character’s original starting settlement cannot be deleted.",
        );
      if (!Number.isFinite(entryCost(tileAt(hexAt(origin, world), world))))
        throw new HttpsError(
          "failed-precondition",
          "Character origins must remain walkable.",
        );
      if (geometryChanged)
        tx.update(doc.ref, center(hexAt(origin, world), world));
      else if (!Number.isFinite(entryCost(tileAt(hexAt(c, world), world))))
        throw new HttpsError(
          "failed-precondition",
          "An occupied tile cannot become impassable.",
        );
    }
    tx.set(db.doc(`worldBackups/${previous.version}`), previous);
    tx.set(worldRef, next);
    return next;
  });
});
