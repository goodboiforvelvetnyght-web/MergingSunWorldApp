import { doc, getDoc, onSnapshot, type DocumentData } from "firebase/firestore";
import { auth, db } from "./firebase";
import { call } from "./useWorld";
import {
  MAP_UPLOAD_BYTES,
  MAP_CHUNK_BYTES,
  type MapArtwork,
} from "../shared/mapImages";
export type UploadProgress = {
  stage: "uploading" | "processing";
  percent: number;
  detail: string;
};
export async function uploadLargeMap(
  file: File,
  progress: (value: UploadProgress) => void,
): Promise<MapArtwork> {
  if (file.size > MAP_UPLOAD_BYTES)
    throw new Error("Choose a map up to 25 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Use a PNG, JPEG, or WebP image.");
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in as an admin to upload a map.");
  progress({ stage: "uploading", percent: 0, detail: "Checking map file…" });
  const bytes = await file.arrayBuffer();
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  const pendingKey = `ms:map-upload:${uid}`;
  let id = localStorage.getItem(pendingKey);
  let previous: DocumentData | undefined;
  if (id) {
    previous = (await getDoc(doc(db, "mapUploads", id))).data();
    if (
      !previous ||
      previous.sha256 !== hash ||
      previous.expiresAt < Date.now()
    )
      id = null;
  }
  if (!id) {
    id = crypto.randomUUID();
    previous = undefined;
  }
  localStorage.setItem(pendingKey, id);
  const acknowledged = await call<{ received: Record<string, string> }>(
    "beginMapUpload",
    {
      id,
      size: file.size,
      contentType: file.type,
      sha256: hash,
    },
  );
  if (
    !previous ||
    previous.status === "uploading" ||
    previous.status === "failed"
  ) {
    const count = Math.ceil(file.size / MAP_CHUNK_BYTES);
    let uploaded = 0,
      next = 0,
      aborted = false;
    const uploads = await Promise.allSettled(
      Array.from({ length: Math.min(3, count) }, async () => {
        while (!aborted && next < count) {
          const index = next++,
            chunk = new Uint8Array(
              bytes,
              index * MAP_CHUNK_BYTES,
              Math.min(MAP_CHUNK_BYTES, file.size - index * MAP_CHUNK_BYTES),
            );
          const known = acknowledged.received[String(index)];
          if (known) {
            const chunkHash = Array.from(
              new Uint8Array(await crypto.subtle.digest("SHA-256", chunk)),
              (b) => b.toString(16).padStart(2, "0"),
            ).join("");
            if (chunkHash === known) {
              uploaded += chunk.byteLength;
              progress({
                stage: "uploading",
                percent: Math.round((uploaded / file.size) * 100),
                detail: `Uploading map: ${Math.round((uploaded / file.size) * 100)}%`,
              });
              continue;
            }
          }
          // Avoid spreading a megabyte into a function call or making a second full-file base64 copy.
          let binary = "";
          for (let start = 0; start < chunk.length; start += 32768)
            binary += String.fromCharCode(
              ...chunk.subarray(start, start + 32768),
            );
          let lastError: unknown;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              await call("uploadMapChunk", { id, index, data: btoa(binary) });
              lastError = null;
              break;
            } catch (e) {
              lastError = e;
              if (
                ![
                  "functions/unavailable",
                  "functions/internal",
                  "functions/deadline-exceeded",
                ].includes((e as { code?: string }).code ?? "")
              ) {
                aborted = true;
                throw e;
              }
            }
          }
          if (lastError) {
            aborted = true;
            throw lastError;
          }
          uploaded += chunk.byteLength;
          progress({
            stage: "uploading",
            percent: Math.round((uploaded / file.size) * 100),
            detail: `Uploading map: ${Math.round((uploaded / file.size) * 100)}%`,
          });
        }
      }),
    );
    const failed = uploads.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }
  progress({
    stage: "processing",
    percent: 0,
    detail: "Checking original image…",
  });
  let unsubscribe = () => {},
    timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<MapArtwork>((resolve, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              "Map processing is taking longer than expected. Select the same file again to check or resume it.",
            ),
          ),
        600000,
      );
      let processingSeen = previous?.status === "processing";
      unsubscribe = onSnapshot(
        doc(db, "mapUploads", id!),
        (snapshot) => {
          const job = snapshot.data();
          if (job?.status === "ready") {
            resolve(job.result as MapArtwork);
          } else if (job?.status === "failed" && processingSeen)
            reject(new Error(job.error ?? "The map could not be prepared."));
          else if (job?.status === "processing") {
            processingSeen = true;
            progress({
              stage: "processing",
              percent: job.progress ?? 0,
              detail: `${job.stage ?? "Preparing map tiles"}: ${job.progress ?? 0}%`,
            });
          }
        },
        reject,
      );
      call<MapArtwork | { processing: boolean }>("processMapUpload", {
        id,
      }).then((result) => {
        if ("id" in result) {
          resolve(result);
        }
      }, reject);
    });
  } finally {
    unsubscribe();
    if (timer) clearTimeout(timer);
  }
}
