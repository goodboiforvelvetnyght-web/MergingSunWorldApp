import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "./firebase.js";
import { requireAdmin } from "./adminInvitations.js";
import { bucket, validateAsset } from "./assets.js";
import type { WorldEvent, EventParticipant } from "../../shared/events.js";
const options = {
  region: "asia-southeast1",
  maxInstances: 3,
  serviceAccount: "merging-sun-runtime@mergingsunapp-2.iam.gserviceaccount.com",
};
function text(v: unknown, max: number, required = false): string {
  if (typeof v !== "string" || v.length > max || (required && !v.trim()))
    throw new HttpsError(
      "invalid-argument",
      "Check the required fields and text lengths.",
    );
  return v.trim();
}
function id(v: unknown) {
  const s = text(v, 128, true);
  if (!/^[\w-]+$/.test(s))
    throw new HttpsError("invalid-argument", "Invalid identifier.");
  return s;
}
export const manageEvent = onCall(options, async (request) => {
  await requireAdmin(request.auth);
  const d = request.data ?? {},
    eventId = id(d.id),
    ref = db.doc(`events/${eventId}`);
  if (d.action === "save") {
    const e = d.event;
    if (
      !e ||
      !["regular", "major"].includes(e.kind) ||
      !Array.isArray(e.sides) ||
      e.sides.length !== 2 ||
      typeof e.published !== "boolean"
    )
      throw new HttpsError("invalid-argument", "Provide two event sides.");
    const sides = [];
    for (const s of e.sides) {
      await validateAsset(s.artwork, "cover");
      await validateAsset(s.logo, "emblem");
      sides.push({
        name: text(s.name, 100, true),
        artwork: s.artwork ?? null,
        logo: s.logo ?? null,
      });
    }
    const clean = {
      title: text(e.title, 160, true),
      kind: e.kind,
      date: text(e.date, 100, true),
      venue: text(e.venue, 300),
      story: text(e.story, 30000),
      aftermath: text(e.aftermath, 30000),
      locationId: e.locationId ? id(e.locationId) : null,
      published: e.published,
      sides,
    };
    await db.runTransaction(async (tx) => {
      const old = (await tx.get(ref)).data() as WorldEvent | undefined;
      if ((old?.revision ?? 0) !== d.revision)
        throw new HttpsError(
          "aborted",
          "This event changed. Reload before saving.",
        );
      if (old?.participants.length && clean.kind !== old.kind)
        throw new HttpsError(
          "failed-precondition",
          "Remove participants before changing event type.",
        );
      tx.set(ref, {
        ...clean,
        id: eventId,
        participants: old?.participants ?? [],
        revision: (old?.revision ?? 0) + 1,
      });
    });
    return { ok: true };
  }
  const participantId = id(d.participantId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref),
      e = snap.data() as WorldEvent | undefined;
    if (!e || e.kind !== "major")
      throw new HttpsError("not-found", "Major event not found.");
    let participants = [...e.participants];
    const index = participants.findIndex((p) => p.id === participantId);
    const linkRef = ref.collection("links").doc(participantId);
    if (d.action === "participant") {
      if (![0, 1].includes(d.side))
        throw new HttpsError("invalid-argument", "Choose a side.");
      const p: EventParticipant = {
        id: participantId,
        side: d.side,
        characterName: text(d.characterName, 100, true),
        playerIdentity: text(d.playerIdentity, 100, true),
        characterClass: text(d.characterClass, 100, true),
        linked: index >= 0 && participants[index].linked,
      };
      if (index < 0) participants.push(p);
      else participants[index] = p;
      if (participants.length > 500)
        throw new HttpsError(
          "resource-exhausted",
          "Maximum 500 participants per event.",
        );
    } else {
      if (index < 0)
        throw new HttpsError("not-found", "Participant not found.");
      if (d.action === "remove") {
        participants = participants.filter((p) => p.id !== participantId);
        tx.delete(linkRef);
      } else if (d.action === "unlink" || d.action === "reject") {
        participants[index] = { ...participants[index], linked: false };
        tx.delete(linkRef);
      } else if (d.action === "approve" || d.action === "link") {
        const previous = (await tx.get(linkRef)).data();
        const uid = id(d.action === "link" ? d.uid : previous?.uid);
        const c = (await tx.get(db.doc(`characters/${uid}`))).data();
        const links = await tx.get(
          ref.collection("links").where("uid", "==", uid),
        );
        if (links.docs.some((l) => l.id !== participantId))
          throw new HttpsError(
            "already-exists",
            "This character already has an entry or request in this event.",
          );
        if (!c)
          throw new HttpsError(
            "failed-precondition",
            "An approved character is required.",
          );
        if (d.action === "approve" && previous?.status !== "pending")
          throw new HttpsError("failed-precondition", "No pending request.");
        participants[index] = { ...participants[index], linked: true };
        tx.set(linkRef, {
          participantId,
          uid,
          status: "approved",
          name: c.name,
          title: c.title ?? "",
          bio: c.bio ?? "",
          portraitPath: c.portraitPath ?? "",
          portrait: c.portrait ?? "",
        });
      } else throw new HttpsError("invalid-argument", "Unknown action.");
    }
    tx.update(ref, { participants, revision: e.revision + 1 });
  });
  return { ok: true };
});
export const requestEventLink = onCall(options, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = request.auth.uid,
    d = request.data ?? {},
    ref = db.doc(`events/${id(d.id)}`),
    participantId = id(d.participantId);
  if (d.consent !== true)
    throw new HttpsError("invalid-argument", "Confirm public profile sharing.");
  await db.runTransaction(async (tx) => {
    const e = (await tx.get(ref)).data() as WorldEvent | undefined;
    const c = (await tx.get(db.doc(`characters/${uid}`))).data();
    const target = ref.collection("links").doc(participantId),
      existing = await tx.get(target);
    const others = await tx.get(
      ref.collection("links").where("uid", "==", uid),
    );
    if (
      !e?.published ||
      e.kind !== "major" ||
      !e.participants.some((p) => p.id === participantId)
    )
      throw new HttpsError("not-found", "Participant not found.");
    if (!c)
      throw new HttpsError(
        "failed-precondition",
        "Create an approved character first.",
      );
    if (existing.exists || !others.empty)
      throw new HttpsError(
        "already-exists",
        "There is already a link or pending request.",
      );
    tx.create(target, { participantId, uid, name: c.name, status: "pending" });
  });
  return { ok: true };
});
export const getEventLinks = onCall(options, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  let admin = false;
  try {
    await requireAdmin(request.auth);
    admin = true;
  } catch {
    /* own requests only */
  }
  const col = db.collection(`events/${id(request.data?.id)}/links`);
  const docs = await (
    admin ? col : col.where("uid", "==", request.auth.uid)
  ).get();
  return {
    links: docs.docs.map((doc) => {
      const l = doc.data();
      return {
        participantId: doc.id,
        uid: l.uid,
        name: l.name,
        status: l.status,
      };
    }),
  };
});
export const getEventProfile = onCall(options, async (request) => {
  const ref = db.doc(`events/${id(request.data?.id)}`),
    participantId = id(request.data?.participantId);
  const profile = await db.runTransaction(async (tx) => {
    const e = (await tx.get(ref)).data() as WorldEvent | undefined;
    const p = (await tx.get(ref.collection("links").doc(participantId))).data();
    if (
      !e?.published ||
      !e.participants.some((p) => p.id === participantId && p.linked) ||
      p?.status !== "approved"
    )
      throw new HttpsError("not-found", "Public event profile not available.");
    return p;
  });
  let image = profile.portrait ?? "";
  if (profile.portraitPath) {
    if (!profile.portraitPath.startsWith(`portraits/${profile.uid}/`))
      throw new HttpsError("internal", "Invalid portrait.");
    const [bytes] = await bucket().file(profile.portraitPath).download();
    image = `data:image/webp;base64,${bytes.toString("base64")}`;
  }
  return { name: profile.name, title: profile.title, bio: profile.bio, image };
});
