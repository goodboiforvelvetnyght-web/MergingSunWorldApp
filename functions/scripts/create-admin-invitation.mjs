// Run privately with trusted Google Application Default Credentials.
import { randomBytes, createHash } from "node:crypto";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const targetUid = process.argv[2] ?? null;
if (targetUid !== null && !/^[A-Za-z0-9_-]{1,128}$/.test(targetUid))
  throw new Error("Invalid target UID.");
initializeApp({
  credential: applicationDefault(),
  projectId: "mergingsunapp-2",
});
const key = `MSA-${randomBytes(32).toString("base64url")}`,
  id = createHash("sha256").update(key).digest("hex");
const createdAt = Date.now(),
  expiresAt = createdAt + 86400000;
await getFirestore()
  .doc(`adminInvitations/${id}`)
  .create({
    createdBy: "project-owner",
    createdAt,
    expiresAt,
    targetUid,
    usedBy: null,
    usedAt: null,
    revokedAt: null,
  });
console.log("Activation page: https://mergingsunapp-2.web.app/admin/activate");
console.log("Single-use key (save privately):", key);
console.log("Expires:", new Date(expiresAt).toISOString());
if (targetUid) console.log("Only this account may redeem it:", targetUid);
