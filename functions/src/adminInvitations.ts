import { createHash, randomBytes } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "./firebase.js";
import { bootstrapInvitation } from "./bootstrap.js";

type Caller = { uid: string; token: Record<string, unknown> } | undefined;
const options = {
  region: "asia-southeast1",
  maxInstances: 5,
  serviceAccount: "merging-sun-runtime@mergingsunapp-2.iam.gserviceaccount.com",
};
export async function requireAdmin(auth: Caller) {
  if (!auth)
    throw new HttpsError("permission-denied", "Only admins can do this.");
  if (auth.token.admin === true) return;
  const role = await db.doc(`adminRoles/${auth.uid}`).get();
  if (role.data()?.role !== "admin")
    throw new HttpsError("permission-denied", "Only admins can do this.");
}
export const invitationHash = (key: string) =>
  createHash("sha256").update(key).digest("hex");

export const generateAdminInvitation = onCall(options, async (request) => {
  await requireAdmin(request.auth);
  const now = Date.now(),
    uid = request.auth!.uid;
  const key = `MSA-${randomBytes(32).toString("base64url")}`;
  const id = invitationHash(key),
    expiresAt = now + 24 * 60 * 60 * 1000;
  await db.runTransaction(async (tx) => {
    const throttle = db.doc(`invitationGenerationLimits/${uid}`);
    const snapshot = await tx.get(throttle),
      previous = snapshot.data();
    const count =
      previous && now - previous.startedAt < 3600000 ? previous.count : 0;
    if (count >= 5)
      throw new HttpsError(
        "resource-exhausted",
        "You can generate up to five invitations per hour.",
      );
    tx.set(throttle, {
      startedAt: count ? previous!.startedAt : now,
      count: count + 1,
    });
    tx.create(db.doc(`adminInvitations/${id}`), {
      createdBy: uid,
      createdAt: now,
      expiresAt,
      usedBy: null,
      usedAt: null,
      revokedAt: null,
    });
  });
  // The plaintext is returned once to its creator and is never stored or logged.
  return { key, id, expiresAt };
});

export const redeemAdminInvitation = onCall(options, async (request) => {
  if (!request.auth)
    throw new HttpsError(
      "unauthenticated",
      "Sign in before activating admin access.",
    );
  const uid = request.auth.uid,
    key = request.data?.key;
  if (typeof key !== "string" || !/^MSA-[A-Za-z0-9_-]{43}$/.test(key.trim()))
    throw new HttpsError("invalid-argument", "Enter a valid activation key.");
  const id = invitationHash(key.trim()),
    now = Date.now();
  const result = await db.runTransaction(async (tx) => {
    const ref = db.doc(`adminInvitations/${id}`),
      roleRef = db.doc(`adminRoles/${uid}`),
      throttle = db.doc(`invitationRedemptionLimits/${uid}`);
    const [snapshot, role, attempts] = await Promise.all([
      tx.get(ref),
      tx.get(roleRef),
      tx.get(throttle),
    ]);
    const previous = attempts.data();
    const count =
      previous && now - previous.startedAt < 600000 ? previous.count : 0;
    if (count >= 10) return "limited";
    const bootstrap =
      id === bootstrapInvitation.hash &&
      uid === bootstrapInvitation.uid &&
      now < bootstrapInvitation.expiresAt;
    const invitation =
      snapshot.data() ??
      (bootstrap
        ? {
            createdBy: "bootstrap",
            targetUid: bootstrapInvitation.uid,
            createdAt: now,
            expiresAt: bootstrapInvitation.expiresAt,
            usedBy: null,
            revokedAt: null,
          }
        : null);
    if (invitation?.usedBy === uid && role.data()?.invitationId === id)
      return "ok";
    if (
      !invitation ||
      invitation.expiresAt <= now ||
      invitation.usedBy ||
      invitation.revokedAt ||
      (invitation.targetUid && invitation.targetUid !== uid) ||
      (id === bootstrapInvitation.hash && uid !== bootstrapInvitation.uid)
    ) {
      tx.set(throttle, {
        startedAt: count ? previous!.startedAt : now,
        count: count + 1,
      });
      return "invalid";
    }
    tx.set(ref, { ...invitation, usedBy: uid, usedAt: now });
    tx.set(roleRef, {
      role: "admin",
      grantedBy: invitation.createdBy,
      grantedAt: now,
      invitationId: id,
    });
    tx.delete(throttle);
    return "ok";
  });
  if (result === "limited")
    throw new HttpsError(
      "resource-exhausted",
      "Too many attempts. Wait ten minutes and try again.",
    );
  if (result !== "ok")
    throw new HttpsError(
      "failed-precondition",
      "This key is invalid, expired, revoked, or already used.",
    );
  return { admin: true };
});

export const revokeAdminInvitation = onCall(options, async (request) => {
  await requireAdmin(request.auth);
  const id = request.data?.id;
  if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id))
    throw new HttpsError("invalid-argument", "Invalid invitation.");
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`adminInvitations/${id}`),
      snapshot = await tx.get(ref);
    if (!snapshot.exists || snapshot.data()?.usedBy)
      throw new HttpsError(
        "failed-precondition",
        "Only unused invitations can be revoked.",
      );
    tx.update(ref, { revokedAt: Date.now() });
  });
  return { revoked: true };
});
