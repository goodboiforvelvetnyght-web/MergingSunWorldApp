import { getStorage } from "firebase-admin/storage";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import * as logger from "firebase-functions/logger";
import { prepareMapTiles } from "./mapTiles.js";
import { db } from "./firebase.js";
import { requireAdmin } from "./adminInvitations.js";
import { ASSET_BUCKET } from "../../shared/assets.js";
export const bucket = () =>
  getStorage().bucket(
    process.env.FUNCTIONS_EMULATOR === "true"
      ? "demo-merging-sun.appspot.com"
      : ASSET_BUCKET,
  );
const options = {
  region: "asia-southeast1",
  maxInstances: 3,
  serviceAccount: "merging-sun-runtime@mergingsunapp-2.iam.gserviceaccount.com",
};
export async function savePortrait(
  uid: string,
  id: string,
  data: string,
): Promise<string> {
  if (!data) return "";
  const bytes = Buffer.from(data.split(",")[1] ?? "", "base64");
  const image = await sharp(bytes, { limitInputPixels: 16000000 })
    .rotate()
    .resize(512, 512, { fit: "cover" })
    .webp({ quality: 85 })
    .toBuffer();
  const path = `portraits/${uid}/${id}.webp`;
  await bucket()
    .file(path)
    .save(image, {
      contentType: "image/webp",
      resumable: false,
      metadata: { cacheControl: "private,no-store" },
    });
  return path;
}
export const uploadWorldAsset = onCall(
  { ...options, memory: "1GiB", timeoutSeconds: 300, concurrency: 1 },
  async (request) => {
    await requireAdmin(request.auth);
    const { kind, image } = request.data ?? {};
    if (
      !["map", "emblem", "cover"].includes(kind) ||
      typeof image !== "string" ||
      image.length > 8400000 ||
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image)
    )
      throw new HttpsError(
        "invalid-argument",
        "Choose a JPEG, PNG, or WebP up to 6 MB.",
      );
    let nativeZoom = 3;
    const id = randomUUID(),
      bytes = Buffer.from(image.split(",")[1], "base64");
    let width = 0,
      height = 0;
    try {
      const meta = await sharp(bytes, {
        limitInputPixels: 64000000,
      }).metadata();
      if (
        !meta.width ||
        !meta.height ||
        (meta.pages ?? 1) > 1 ||
        !["png", "jpeg", "webp"].includes(meta.format ?? "")
      )
        throw new Error();
      width = meta.width;
      height = meta.height;
    } catch {
      throw new HttpsError(
        "invalid-argument",
        "Use a still raster image of at most 64 megapixels.",
      );
    }
    const save = async (path: string, buffer: Buffer) =>
      bucket()
        .file(path)
        .save(buffer, {
          contentType: "image/webp",
          resumable: false,
          metadata: { cacheControl: "public,max-age=31536000,immutable" },
        });
    const startedAt = Date.now();
    let stage = "processing";
    logger.info("Preparing world artwork", {
      id,
      kind,
      width,
      height,
      bytes: bytes.length,
    });
    try {
      if (kind === "cover") {
        const buffer = await sharp(bytes, { limitInputPixels: 64000000 })
          .rotate()
          .resize(1920, 1920, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer();
        await save(`public/covers/${id}/image.webp`, buffer);
      } else if (kind === "emblem") {
        const buffer = await sharp(bytes, { limitInputPixels: 64000000 })
          .rotate()
          .resize(256, 256, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 90 })
          .toBuffer();
        await save(`public/emblems/${id}/image.webp`, buffer);
      } else {
        nativeZoom = width > 2400 || height > 1800 ? 4 : 3;
        await prepareMapTiles(bytes, nativeZoom, (path, buffer) =>
          save(`public/maps/${id}/${path}`, buffer),
        );
      }
      stage = "manifest";
      await db.doc(`imageAssets/${id}`).set({
        kind,
        createdAt: Date.now(),
        createdBy: request.auth!.uid,
        width,
        height,
        nativeZoom,
      });
      logger.info("World artwork ready", {
        id,
        kind,
        nativeZoom,
        durationMs: Date.now() - startedAt,
      });
      return { id, nativeZoom };
    } catch (error) {
      const failure = error as { name?: string; code?: string | number };
      logger.error("World artwork preparation failed", {
        id,
        kind,
        stage,
        durationMs: Date.now() - startedAt,
        errorType: failure?.name ?? "unknown",
        errorCode: failure?.code ?? "unknown",
      });
      throw new HttpsError(
        "internal",
        "The image could not be prepared. Please try uploading it again.",
      );
    }
  },
);
export async function validateAsset(id: unknown, kind: string) {
  if (id === undefined || id === null) return null;
  if (typeof id !== "string" || !/^[\w-]{36}$/.test(id))
    throw new HttpsError("invalid-argument", "Invalid image asset.");
  const asset = await db.doc(`imageAssets/${id}`).get();
  if (asset.data()?.kind !== kind)
    throw new HttpsError(
      "failed-precondition",
      "Upload and finish processing this image before publishing.",
    );
  return asset.data();
}
