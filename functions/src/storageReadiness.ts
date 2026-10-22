import { onRequest } from "firebase-functions/v2/https";
import { bucket } from "./assets.js";
// Deployment preflight only: reads this runtime's permissions; never reads or writes user images.
let cached: { at: number; ready: boolean } | undefined;
export const storageReadiness = onRequest(
  {
    region: "asia-southeast1",
    maxInstances: 1,
    timeoutSeconds: 15,
    serviceAccount:
      "merging-sun-runtime@mergingsunapp-2.iam.gserviceaccount.com",
  },
  async (_request, response) => {
    if (!cached || Date.now() - cached.at > 30000) {
      let ready = false;
      try {
        const required = [
          "storage.objects.get",
          "storage.objects.create",
          "storage.objects.update",
          "storage.objects.delete",
        ];
        const [permissions] = await bucket().iam.testPermissions(required);
        ready = required.every((p) => permissions[p]);
      } catch {
        /* Missing bucket access must stop deployment before releasing the new app. */
      }
      cached = { at: Date.now(), ready };
    }
    response
      .set("Cache-Control", "no-store")
      .status(200)
      .json({ ready: cached.ready });
  },
);
