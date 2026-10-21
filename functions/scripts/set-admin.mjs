// Run with Application Default Credentials. Never put a service-account key in this repository.
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
const uid = process.argv[2];
if (!uid) {
  console.error(
    "Usage: npm --prefix functions run set-admin -- FIREBASE_AUTH_UID",
  );
  process.exit(1);
}
initializeApp({
  credential: applicationDefault(),
  projectId: "mergingsunapp-2",
});
const user = await getAuth().getUser(uid);
await getAuth().setCustomUserClaims(uid, { ...user.customClaims, admin: true });
console.log("Admin role assigned. Sign out and back in to refresh the role.");
