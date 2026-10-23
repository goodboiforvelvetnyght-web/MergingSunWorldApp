import {
  DEFAULT_TRAVEL_RULES,
  TRAVEL_MODEL_VERSION,
  TERRAIN_TYPES,
  FEATURE_TYPES,
  travelRulesError,
} from "../../shared/travelRules.js";
import { normalizeTile } from "../../shared/world.js";
export {
  beginMapUpload,
  uploadMapChunk,
  processMapUpload,
} from "./mapUploads.js";
export { storageReadiness } from "./storageReadiness.js";
import { randomUUID } from "node:crypto";
import { savePortrait, validateAsset } from "./assets.js";
export { uploadWorldAsset } from "./assets.js";
import {
  populationRef,
  readPopulation,
  updatePopulation,
} from "./characters.js";
export {
  reviewCharacter,
  enterLocation,
  getRoomCharacters,
  getCharacterPortrait,
  initializePopulation,
  migrateLegacyPortraits,
} from "./characters.js";
import { db } from "./firebase.js";
import {
  sameMapSize,
  gridChangedAfterAlignment,
  mapTransform,
  transformPoint,
  pointOnMap,
} from "../../shared/mapAlignment.js";
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
  worldSize,
  inBounds,
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
  type CharacterApplication,
  populationCounts,
  enteredSettlement,
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
function point(
  v: unknown,
  bounds = { width: 2400, height: 2400 },
): v is { x: number; y: number } {
  return (
    !!v &&
    typeof v === "object" &&
    "x" in v &&
    "y" in v &&
    typeof v.x === "number" &&
    typeof v.y === "number" &&
    Number.isFinite(v.x) &&
    Number.isFinite(v.y) &&
    v.x >= -1e-6 &&
    v.x <= bounds.width + 1e-6 &&
    v.y >= -1e-6 &&
    v.y <= bounds.height + 1e-6
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
  const applicationRef = db.doc(`characterApplications/${request.auth!.uid}`);
  const pending = (await applicationRef.get()).data() as
    CharacterApplication | undefined;
  if (pending?.id === requestId) return pending.candidate;
  if (pending?.status === "pending")
    throw new HttpsError(
      "already-exists",
      "Your character is awaiting review.",
    );
  const portraitPath = portrait
    ? await savePortrait(request.auth.uid, randomUUID(), portrait)
    : "";
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`characters/${request.auth!.uid}`);
    const [existing, ws, application, archivedRequest] = await Promise.all([
      tx.get(ref),
      tx.get(worldRef),
      tx.get(applicationRef),
      tx.get(applicationRef.collection("history").doc(requestId)),
    ]);
    const app = application.data() as CharacterApplication | undefined;
    if (app?.id === requestId) return app.candidate;
    if (archivedRequest.exists)
      throw new HttpsError(
        "failed-precondition",
        "This creation request belongs to an older character. Start a fresh character draft.",
      );
    if (app?.status === "pending")
      throw new HttpsError(
        "already-exists",
        "Your character is awaiting review.",
      );
    if (app?.status === "rejected" && data.expectedApplicationId !== app.id)
      throw new HttpsError(
        "failed-precondition",
        "This application changed. Reopen your rejected character to edit it.",
      );
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
    if (
      !location ||
      !Number.isFinite(entryCost(tileAt(hexAt(location, w), w), w))
    )
      throw new HttpsError(
        "failed-precondition",
        "Choose a walkable starting settlement belonging to a kingdom.",
      );
    const c: Character = {
      ...makeCharacter(name, title, bio, location, w),
      realName,
      portrait: "",
      portraitPath,
      incarnationId: requestId,
      currentLocationId: null,
      internalLocationId: null,
    };
    const submission: CharacterApplication = {
      id: requestId,
      status: "pending",
      candidate: c,
      expectedGeneration: previous ? characterGeneration(previous) : null,
      submittedAt: Date.now(),
    };
    tx.set(applicationRef, submission);
    tx.set(applicationRef.collection("history").doc(requestId), submission);
    return c;
  });
});
export const travel = onCall(async (request) => {
  if (!request.auth)
    throw new HttpsError("unauthenticated", "Sign in to travel.");
  if (request.data?.travelModel !== TRAVEL_MODEL_VERSION)
    throw new HttpsError(
      "failed-precondition",
      "Travel rules have been updated. Refresh the app and preview your journey again.",
    );
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
    if (enteredSettlement(c, w))
      throw new HttpsError(
        "failed-precondition",
        "Leave the city before starting a journey.",
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
    const counts = await readPopulation(tx, w);
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
    updatePopulation(tx, counts, c, character, w);
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
    !Number.isFinite(w.radius) ||
    w.radius < 16 ||
    w.radius > 128 ||
    !Number.isFinite(w.offsetX) ||
    !Number.isFinite(w.offsetY) ||
    Math.abs(w.offsetX) > 256 ||
    Math.abs(w.offsetY) > 256 ||
    !Number.isFinite(w.mapWidth ?? 2400) ||
    !Number.isFinite(w.mapHeight ?? 1800) ||
    (w.mapWidth ?? 2400) < 1 ||
    (w.mapWidth ?? 2400) > 2400 ||
    (w.mapHeight ?? 1800) < 1 ||
    (w.mapHeight ?? 1800) > 2400 ||
    (w.terrainBase !== undefined && w.terrainBase !== "water") ||
    !w.tiles ||
    typeof w.tiles !== "object" ||
    Array.isArray(w.tiles) ||
    Object.keys(w.tiles).length > 10000 ||
    !Array.isArray(w.locations) ||
    w.locations.length > 200 ||
    !Array.isArray(w.territories) ||
    w.territories.length > 30
  )
    throw new HttpsError("invalid-argument", "World limits exceeded.");
  const rulesError = travelRulesError(w.travelRules ?? DEFAULT_TRAVEL_RULES);
  if (rulesError) throw new HttpsError("invalid-argument", rulesError);
  const bounds = worldSize(w);
  if (
    w.mapAlignment &&
    (!Number.isInteger(w.mapAlignment.baseVersion) ||
      !["fit", "unpad"].includes(w.mapAlignment.mode))
  )
    throw new HttpsError("invalid-argument", "Invalid map alignment.");
  const tiles: World["tiles"] = {};
  for (const [k, t] of Object.entries(w.tiles)) {
    if (
      !/^-?\d{1,3},-?\d{1,3}$/.test(k) ||
      !t ||
      ![...TERRAIN_TYPES, "forest", "mountain", "water"].includes(t.terrain) ||
      typeof t.river !== "boolean" ||
      (t.features !== undefined &&
        (!Array.isArray(t.features) ||
          t.features.length > 4 ||
          new Set(t.features).size !== t.features.length ||
          t.features.some(
            (f) => f === ("river" as string) || !FEATURE_TYPES.includes(f),
          ) ||
          (t.features.includes("hills") &&
            (t.features.includes("mountain") || t.terrain === "mountain")))) ||
      (t.road !== undefined && typeof t.road !== "boolean")
    )
      throw new HttpsError("invalid-argument", "Invalid terrain tile.");
    tiles[k] = normalizeTile(t);
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
      !t.points.every(
        (p) =>
          point(p, bounds) &&
          (p.sharp === undefined || typeof p.sharp === "boolean"),
      ) ||
      (t.borderStyle !== undefined &&
        !["straight", "smooth"].includes(t.borderStyle)) ||
      (t.emblemPosition != null && !point(t.emblemPosition, bounds)) ||
      (t.emblemAssetId != null &&
        (typeof t.emblemAssetId !== "string" ||
          !/^[\w-]{36}$/.test(t.emblemAssetId)))
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
      points: t.points.map((p) => ({
        x: p.x,
        y: p.y,
        ...(p.sharp !== undefined ? { sharp: p.sharp } : {}),
      })),
      ...(t.borderStyle ? { borderStyle: t.borderStyle } : {}),
      emblemAssetId: t.emblemAssetId ?? null,
      emblemPosition: t.emblemPosition ?? null,
    };
  });
  const locations = w.locations.map((l) => {
    if (
      !l ||
      !point(l, bounds) ||
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
    if (
      l.entries.some(
        (e) => typeof e?.id === "string" && e.id.startsWith("commons-"),
      )
    )
      throw new HttpsError(
        "invalid-argument",
        "Internal location IDs beginning with commons- are reserved.",
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
    travelRules: structuredClone(w.travelRules ?? DEFAULT_TRAVEL_RULES),
    mapAssetId: w.mapAssetId ?? null,
    mapWidth: bounds.width,
    mapHeight: bounds.height,
    ...(w.mapLayout === "natural" ? { mapLayout: "natural" as const } : {}),
    ...(w.terrainBase === "water" ? { terrainBase: "water" as const } : {}),
    ...(w.mapAlignment
      ? {
          mapAlignment: {
            baseVersion: w.mapAlignment.baseVersion,
            mode: w.mapAlignment.mode,
          },
        }
      : {}),
    version: w.version,
    radius: w.radius,
    offsetX: w.offsetX,
    offsetY: w.offsetY,
    tiles,
    locations,
    territories,
  };
  for (const l of locations.filter((l) => l.starting))
    if (
      !inBounds(hexAt(l, clean), clean) ||
      !Number.isFinite(entryCost(tileAt(hexAt(l, clean), clean), clean))
    )
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
  const mapAsset = await validateAsset(world.mapAssetId, "map");
  world.mapNativeZoom = mapAsset?.nativeZoom ?? 3;
  const natural = mapAsset?.mapLayout === "natural";
  if (
    world.mapWidth !== (natural ? mapAsset.mapWidth : 2400) ||
    world.mapHeight !== (natural ? mapAsset.mapHeight : 1800)
  )
    throw new HttpsError(
      "failed-precondition",
      "Apply this map’s alignment preview before publishing.",
    );
  if (natural) world.mapLayout = "natural";
  else delete world.mapLayout;
  await Promise.all(
    world.territories.map((k) => validateAsset(k.emblemAssetId, "emblem")),
  );
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
    if (!sameMapSize(previous, world) && !world.mapAlignment)
      throw new HttpsError(
        "failed-precondition",
        "Preview and apply map alignment before changing world proportions.",
      );
    if (
      world.mapAlignment &&
      (world.mapAlignment.baseVersion !== previous.version ||
        (world.mapAlignment.mode === "unpad" &&
          previous.mapLayout === "natural"))
    )
      throw new HttpsError(
        "failed-precondition",
        "This map alignment is stale or does not apply to the previous artwork.",
      );
    const geometryChanged = gridChangedAfterAlignment(previous, world);
    const alignment = world.mapAlignment
      ? mapTransform(previous, world, world.mapAlignment.mode)
      : null;
    const next = { ...world, version: previous.version + 1 };
    delete next.mapAlignment;
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
    const updatedCharacters: Character[] = [];
    for (const doc of characters.docs) {
      const c = doc.data() as Character;
      const aligned = alignment ? { ...c, ...transformPoint(c, alignment) } : c;
      if (!pointOnMap(aligned, world))
        throw new HttpsError(
          "failed-precondition",
          "A character is outside the new map. Choose Fit existing world or move characters out of the old padding first.",
        );
      const updated = characterAfterWorldChange(
        aligned,
        world,
        geometryChanged,
      );
      if (
        !Number.isFinite(
          entryCost(tileAt(hexAt(updated, world), world), world),
        ) &&
        (geometryChanged ||
          !!world.mapAlignment ||
          Number.isFinite(
            entryCost(tileAt(hexAt(c, previous), previous), previous),
          ))
      )
        throw new HttpsError(
          "failed-precondition",
          "An occupied tile or grid-reset destination cannot become impassable.",
        );
      updatedCharacters.push(updated);
      if (JSON.stringify(updated) !== JSON.stringify(c))
        tx.set(doc.ref, updated);
    }
    tx.set(populationRef, {
      counts: populationCounts(updatedCharacters, world),
      presenceVersion: 2,
      updatedAt: Date.now(),
    });
    tx.set(db.doc(`worldBackups/${previous.version}`), previous);
    tx.set(worldRef, next);
    return next;
  });
});
