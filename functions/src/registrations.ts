import { onCall, HttpsError } from "firebase-functions/v2/https";
import { createHash } from "node:crypto";
import { db } from "./firebase.js";
import { requireAdmin } from "./adminInvitations.js";
import {
  validateRegistrationConfig,
  cleanRegistrationAnswers,
  type RegistrationConfig,
  type RegistrationRecord,
} from "../../shared/registration.js";
import type { WorldEvent } from "../../shared/events.js";
const options = {
  region: "asia-southeast1",
  maxInstances: 3,
  serviceAccount: "merging-sun-runtime@mergingsunapp-2.iam.gserviceaccount.com",
};
export function regId(v: unknown) {
  if (typeof v !== "string" || !/^[-\w]{1,128}$/.test(v))
    throw new HttpsError("invalid-argument", "Invalid reference.");
  return v;
}
export const saveRegistrationForm = onCall(options, async (req) => {
  await requireAdmin(req.auth);
  const id = regId(req.data?.eventId),
    c = req.data?.config as RegistrationConfig;
  try {
    validateRegistrationConfig(c);
  } catch (e) {
    throw new HttpsError("invalid-argument", (e as Error).message);
  }
  const clean: RegistrationConfig = {
    version: 0,
    open: c.open,
    introduction: c.introduction,
    sideGuidance: c.sideGuidance,
    terms: c.terms,
    confirmation: c.confirmation,
    headings: c.headings,
    fields: c.fields.map((f) => ({
      id: f.id,
      label: f.label,
      description: f.description,
      type: f.type,
      required: f.required,
      choices: f.choices,
      step: f.step,
    })),
  };
  const ref = db.doc(`events/${id}`);
  return db.runTransaction(async (tx) => {
    const e = (await tx.get(ref)).data() as WorldEvent | undefined;
    const current = (
      await tx.get(ref.collection("registration").doc("config"))
    ).data() as RegistrationConfig | undefined;
    const draft = await tx.get(db.doc(`registrationDrafts/${id}`));
    if (!e || e.kind !== "major")
      throw new HttpsError("failed-precondition", "Choose a major event.");
    if ((draft.data()?.revision ?? 0) !== req.data.revision)
      throw new HttpsError(
        "aborted",
        "The form draft changed. Reopen it before saving.",
      );
    const revision = (draft.data()?.revision ?? 0) + 1;
    if (req.data.publish === true) {
      const version = (current?.version ?? 0) + 1;
      clean.version = version;
      tx.set(
        ref.collection("registrationVersions").doc(String(version)),
        clean,
      );
      tx.set(ref.collection("registration").doc("config"), clean);
      tx.update(ref, { registrationOpen: clean.open });
    } else clean.version = current?.version ?? 0;
    tx.set(db.doc(`registrationDrafts/${id}`), { config: clean, revision });
    return { config: clean, revision };
  });
});
export const submitEventRegistration = onCall(
  { ...options, maxInstances: 5 },
  async (req) => {
    const d = req.data ?? {},
      id = regId(d.eventId),
      rid = regId(d.requestId);
    if (
      !/^[\da-f-]{36}$/i.test(rid) ||
      ![0, 1].includes(d.side) ||
      d.acceptedTerms !== true ||
      d.acceptedColors !== true
    )
      throw new HttpsError(
        "invalid-argument",
        "Choose a side and accept the terms and costume requirements.",
      );
    const ref = db.doc(`events/${id}`),
      rref = ref.collection("registrations").doc(rid);
    const ip = createHash("sha256")
      .update(
        `${id}:${req.rawRequest.ip ?? "unknown"}:${Math.floor(Date.now() / 3600000)}`,
      )
      .digest("hex");
    const limitRef = db.doc(`registrationLimits/${ip}`);
    return db.runTransaction(async (tx) => {
      const existing = await tx.get(rref);
      if (existing.exists) return { reference: rid, status: "received" };
      const e = (await tx.get(ref)).data() as WorldEvent | undefined;
      const c = (
        await tx.get(ref.collection("registration").doc("config"))
      ).data() as RegistrationConfig | undefined;
      const limit = await tx.get(limitRef);
      if (!e?.published || e.kind !== "major" || !c?.open)
        throw new HttpsError(
          "failed-precondition",
          "Registration is currently closed.",
        );
      if (c.version !== d.version)
        throw new HttpsError(
          "failed-precondition",
          "The registration form changed. Reload and review the current terms before submitting.",
        );
      if ((limit.data()?.count ?? 0) >= 20)
        throw new HttpsError(
          "resource-exhausted",
          "Too many requests from this connection. Please try again later.",
        );
      let answers;
      try {
        answers = cleanRegistrationAnswers(c, d.answers);
      } catch (e) {
        throw new HttpsError("invalid-argument", (e as Error).message);
      }
      const now = Date.now();
      tx.create(rref, {
        id: rid,
        side: d.side,
        submittedSide: d.side,
        originalAnswers: answers,
        answers,
        version: c.version,
        acceptedTerms: true,
        acceptedColors: true,
        submittedAt: now,
        updatedAt: now,
        status: "pending",
        reason: "",
        revision: 1,
        syncState: "pending",
        syncToken: 1,
      });
      tx.set(limitRef, {
        count: (limit.data()?.count ?? 0) + 1,
        expiresAt: new Date(now + 86400000),
      });
      return { reference: rid, status: "received" };
    });
  },
);
export const reviewEventRegistration = onCall(options, async (req) => {
  await requireAdmin(req.auth);
  const d = req.data ?? {},
    ref = db.doc(`events/${regId(d.eventId)}`),
    rid = regId(d.registrationId),
    rref = ref.collection("registrations").doc(rid);
  if (!["confirm", "reject", "correct"].includes(d.action))
    throw new HttpsError("invalid-argument", "Choose an action.");
  return db.runTransaction(async (tx) => {
    const r = (await tx.get(rref)).data() as RegistrationRecord | undefined,
      e = (await tx.get(ref)).data() as WorldEvent | undefined;
    if (!r || !e) throw new HttpsError("not-found", "Registration not found.");
    if (r.revision !== d.revision)
      throw new HttpsError(
        "aborted",
        "This request changed. Reopen it before updating.",
      );
    const c = (
      await tx.get(
        ref.collection("registrationVersions").doc(String(r.version)),
      )
    ).data() as RegistrationConfig;
    let answers = r.answers,
      side = r.side;
    if (d.action === "correct") {
      try {
        answers = cleanRegistrationAnswers(c, d.answers);
      } catch (e) {
        throw new HttpsError("invalid-argument", (e as Error).message);
      }
      if (![0, 1].includes(d.side))
        throw new HttpsError("invalid-argument", "Choose a side.");
      side = d.side;
    }
    const status =
      d.action === "confirm"
        ? "confirmed"
        : d.action === "reject"
          ? "rejected"
          : r.status;
    const reason =
      d.action === "reject" ? String(d.reason ?? "").trim() : r.reason;
    if (d.action === "reject" && (!reason || reason.length > 2000))
      throw new HttpsError(
        "invalid-argument",
        "Provide a rejection reason (up to 2,000 characters).",
      );
    const pid = `registration-${rid}`,
      old = e.participants.find((p) => p.id === pid);
    let participants = e.participants.filter((p) => p.id !== pid);
    if (status === "confirmed")
      participants.push({
        id: pid,
        side,
        characterName: String(answers.characterName),
        playerIdentity: String(answers.playerIdentity),
        characterClass: String(answers.characterClass),
        linked: old?.linked ?? false,
      });
    if (participants.length > 500)
      throw new HttpsError("resource-exhausted", "Maximum 500 roster entries.");
    tx.update(rref, {
      answers,
      side,
      status,
      reason,
      updatedAt: Date.now(),
      revision: r.revision + 1,
      syncState: "pending",
    });
    tx.update(ref, { participants, revision: e.revision + 1 });
    if (status === "rejected") tx.delete(ref.collection("links").doc(pid));
    return { ok: true };
  });
});
