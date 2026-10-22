import { onCall, HttpsError } from "firebase-functions/v2/https";
import type { Transaction } from "firebase-admin/firestore";
import { db } from "./firebase.js";
import { requireAdmin } from "./adminInvitations.js";
import { bucket, savePortrait } from "./assets.js";
import {
  DEFAULT_WORLD,
  normalizeWorld,
  characterGeneration,
  characterAfterWorldChange,
  commonsId,
  internalLocations,
  physicalSettlement,
  populationCounts,
  hexAt,
  tileAt,
  entryCost,
  type World,
  type Character,
  type CharacterApplication,
} from "../../shared/world.js";
const options = {
  region: "asia-southeast1",
  maxInstances: 5,
  serviceAccount: "merging-sun-runtime@mergingsunapp-2.iam.gserviceaccount.com",
};
export const populationRef = db.doc("population/main");
export async function readPopulation(tx: Transaction, w: World) {
  const s = await tx.get(populationRef);
  if (s.exists) return { ...s.data()!.counts } as Record<string, number>;
  const chars = await tx.get(db.collection("characters").limit(401));
  if (chars.size > 400)
    throw new HttpsError(
      "resource-exhausted",
      "Population migration is required for more than 400 characters.",
    );
  return populationCounts(
    chars.docs.map((d) => d.data() as Character),
    w,
  );
}
export function updatePopulation(
  tx: Transaction,
  counts: Record<string, number>,
  before: Character | null,
  after: Character | null,
  w: World,
) {
  const a = before && physicalSettlement(before, w),
    b = after && physicalSettlement(after, w);
  if (a) counts[a] = Math.max(0, (counts[a] ?? 0) - 1);
  if (b) counts[b] = (counts[b] ?? 0) + 1;
  tx.set(populationRef, { counts, updatedAt: Date.now() });
}
export const initializePopulation = onCall(options, async (request) => {
  if (!request.auth)
    throw new HttpsError(
      "unauthenticated",
      "Sign in to view population counts.",
    );
  return db.runTransaction(async (tx) => {
    const ws = await tx.get(db.doc("worlds/main"));
    const counts = await readPopulation(
      tx,
      normalizeWorld((ws.data() ?? DEFAULT_WORLD) as World),
    );
    tx.set(populationRef, { counts, updatedAt: Date.now() });
    return { counts };
  });
});
export const reviewCharacter = onCall(options, async (request) => {
  await requireAdmin(request.auth);
  const { uid, applicationId, decision, reason } = request.data ?? {};
  if (
    typeof uid !== "string" ||
    !/^[\w-]{1,128}$/.test(uid) ||
    typeof applicationId !== "string" ||
    !["approved", "rejected"].includes(decision) ||
    (decision === "rejected" &&
      (typeof reason !== "string" || !reason.trim() || reason.length > 2000))
  )
    throw new HttpsError(
      "invalid-argument",
      "Choose a decision and include a rejection reason (up to 2,000 characters).",
    );
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`characterApplications/${uid}`),
      charRef = db.doc(`characters/${uid}`);
    const [as, cs, ws] = await Promise.all([
      tx.get(ref),
      tx.get(charRef),
      tx.get(db.doc("worlds/main")),
    ]);
    const app = as.data() as CharacterApplication | undefined;
    if (!app || app.id !== applicationId)
      throw new HttpsError(
        "failed-precondition",
        "This application changed. Reload the review queue.",
      );
    if (app.status === decision) return { status: decision };
    if (app.status !== "pending")
      throw new HttpsError(
        "failed-precondition",
        "This application has already been reviewed.",
      );
    const now = Date.now(),
      reviewed = {
        ...app,
        status: decision,
        reviewedAt: now,
        reviewedBy: request.auth!.uid,
        rejectionReason: decision === "rejected" ? reason.trim() : "",
      };
    if (decision === "approved") {
      const previous = cs.exists ? (cs.data() as Character) : null;
      if (
        (previous ? characterGeneration(previous) : null) !==
        app.expectedGeneration
      )
        throw new HttpsError(
          "failed-precondition",
          "The active character changed. Ask the player to submit a fresh application.",
        );
      const w = normalizeWorld((ws.data() ?? DEFAULT_WORLD) as World),
        location = w.locations.find(
          (l) =>
            l.id === app.candidate.originLocationId &&
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
          "The starting settlement is no longer available. Reject with a reason so the player can choose another.",
        );
      const counts = await readPopulation(tx, w);
      const candidate = {
        ...characterAfterWorldChange(app.candidate, w, true),
        energy: 100,
        energyAt: now,
        approvedAt: now,
        currentLocationId: location.id,
        internalLocationId: commonsId(location.id),
      };
      if (previous)
        tx.set(
          charRef.collection("incarnations").doc(characterGeneration(previous)),
          previous,
        );
      tx.set(charRef, candidate);
      updatePopulation(tx, counts, previous, candidate, w);
    }
    tx.set(ref, reviewed);
    tx.set(ref.collection("history").doc(app.id), reviewed);
    return { status: decision };
  });
});
export const enterLocation = onCall(options, async (request) => {
  if (!request.auth)
    throw new HttpsError("unauthenticated", "Sign in to enter a location.");
  const { locationId, internalLocationId, generation } = request.data ?? {};
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`characters/${request.auth!.uid}`);
    const [cs, ws] = await Promise.all([
      tx.get(ref),
      tx.get(db.doc("worlds/main")),
    ]);
    if (!cs.exists)
      throw new HttpsError(
        "failed-precondition",
        "An approved character is required.",
      );
    const c = cs.data() as Character,
      w = normalizeWorld((ws.data() ?? DEFAULT_WORLD) as World),
      loc = w.locations.find((l) => l.id === locationId);
    if (generation !== characterGeneration(c))
      throw new HttpsError(
        "failed-precondition",
        "Your character changed. Reload the location.",
      );
    if (
      !loc ||
      !internalLocations(loc).some((e) => e.id === internalLocationId) ||
      physicalSettlement({ ...c, currentLocationId: loc.id }, w) !== loc.id
    )
      throw new HttpsError(
        "failed-precondition",
        "Travel to this settlement's hex before entering.",
      );
    const counts = await readPopulation(tx, w),
      updated = { ...c, currentLocationId: loc.id, internalLocationId };
    tx.set(ref, updated);
    updatePopulation(tx, counts, c, updated, w);
    return updated;
  });
});
export const getRoomCharacters = onCall(options, async (request) => {
  if (!request.auth)
    throw new HttpsError(
      "unauthenticated",
      "Sign in to meet other characters.",
    );
  return db.runTransaction(async (tx) => {
    const [cs, ws] = await Promise.all([
      tx.get(db.doc(`characters/${request.auth!.uid}`)),
      tx.get(db.doc("worlds/main")),
    ]);
    const c = cs.data() as Character | undefined,
      w = normalizeWorld((ws.data() ?? DEFAULT_WORLD) as World);
    const loc =
      c &&
      w.locations.find(
        (l) =>
          l.id === c.currentLocationId && physicalSettlement(c, w) === l.id,
      );
    if (
      !c ||
      !loc ||
      !c.internalLocationId ||
      !internalLocations(loc).some((e) => e.id === c.internalLocationId)
    )
      throw new HttpsError(
        "permission-denied",
        "Enter an internal location to meet the people there.",
      );
    const residents = await tx.get(
      db
        .collection("characters")
        .where("internalLocationId", "==", c.internalLocationId)
        .limit(401),
    );
    if (residents.size > 400)
      throw new HttpsError(
        "resource-exhausted",
        "This room requires paginated character browsing.",
      );
    return residents.docs
      .filter((d) => d.id !== request.auth!.uid)
      .flatMap((d) => {
        const p = d.data() as Character;
        if (
          p.currentLocationId !== loc.id ||
          physicalSettlement(p, w) !== loc.id
        )
          return [];
        return [
          {
            uid: d.id,
            name: p.name,
            title: p.title,
            bio: p.bio,
            originLocationId: p.originLocationId,
            hasPortrait: !!(p.portraitPath || p.portrait),
          },
        ];
      });
  });
});
export const getCharacterPortrait = onCall(
  { ...options, memory: "256MiB" },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Sign in to see this portrait.");
    const uid = request.data?.uid;
    if (typeof uid !== "string" || !/^[\w-]{1,128}$/.test(uid))
      throw new HttpsError("invalid-argument", "Invalid character.");
    let admin = false;
    try {
      await requireAdmin(request.auth);
      admin = true;
    } catch {}
    const data = await db.runTransaction(async (tx) => {
      const targetRef =
        request.data?.application === true &&
        (admin || uid === request.auth!.uid)
          ? db.doc(`characterApplications/${uid}`)
          : db.doc(`characters/${uid}`);
      const target = await tx.get(targetRef),
        c = (
          request.data?.application === true &&
          (admin || uid === request.auth!.uid)
            ? target.data()?.candidate
            : target.data()
        ) as Character | undefined;
      if (!c) return null;
      if (request.auth!.uid !== uid && !admin) {
        const [viewer, ws] = await Promise.all([
          tx.get(db.doc(`characters/${request.auth!.uid}`)),
          tx.get(db.doc("worlds/main")),
        ]);
        const v = viewer.data() as Character | undefined,
          w = normalizeWorld((ws.data() ?? DEFAULT_WORLD) as World),
          loc = w.locations.find((l) => l.id === c.currentLocationId);
        if (
          !v ||
          !loc ||
          !c.internalLocationId ||
          v.internalLocationId !== c.internalLocationId ||
          v.currentLocationId !== loc.id ||
          !internalLocations(loc).some((e) => e.id === c.internalLocationId) ||
          physicalSettlement(v, w) !== loc.id ||
          physicalSettlement(c, w) !== loc.id
        )
          throw new HttpsError(
            "permission-denied",
            "You can inspect characters only in the same internal location.",
          );
      }
      return c;
    });
    if (!data) return { image: "" };
    if (data.portraitPath) {
      if (!data.portraitPath.startsWith(`portraits/${uid}/`))
        throw new HttpsError("internal", "Invalid portrait reference.");
      const [bytes] = await bucket().file(data.portraitPath).download();
      return { image: `data:image/webp;base64,${bytes.toString("base64")}` };
    }
    if (
      data.portrait &&
      request.auth.uid === uid &&
      request.data?.application !== true
    ) {
      const path = await savePortrait(
        uid,
        characterGeneration(data),
        data.portrait,
      );
      await db.runTransaction(async (tx) => {
        const ref = db.doc(`characters/${uid}`),
          current = await tx.get(ref),
          fresh = current.data() as Character | undefined;
        if (
          fresh &&
          characterGeneration(fresh) === characterGeneration(data) &&
          fresh.portrait === data.portrait
        )
          tx.set(ref, { ...fresh, portrait: "", portraitPath: path });
      });
    }
    return { image: data.portrait ?? "" };
  },
);
export const migrateLegacyPortraits = onCall(
  { ...options, timeoutSeconds: 120, memory: "512MiB" },
  async (request) => {
    await requireAdmin(request.auth);
    const docs = await db.collection("characters").limit(401).get();
    if (docs.size > 400)
      throw new HttpsError(
        "resource-exhausted",
        "Use a batched migration for more than 400 characters.",
      );
    let migrated = 0;
    for (const doc of docs.docs) {
      const c = doc.data() as Character;
      if (!c.portrait || c.portraitPath) continue;
      const path = await savePortrait(
        doc.id,
        characterGeneration(c),
        c.portrait,
      );
      await db.runTransaction(async (tx) => {
        const current = await tx.get(doc.ref),
          fresh = current.data() as Character | undefined;
        if (
          fresh &&
          characterGeneration(fresh) === characterGeneration(c) &&
          fresh.portrait === c.portrait
        ) {
          tx.set(doc.ref, { ...fresh, portrait: "", portraitPath: path });
          migrated++;
        }
      });
    }
    return { migrated };
  },
);
