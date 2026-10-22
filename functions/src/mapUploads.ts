import { createHash, randomUUID } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import sharp from "sharp";
import { db } from "./firebase.js";
import { requireAdmin } from "./adminInvitations.js";
import { bucket } from "./assets.js";
import { prepareNaturalMapTiles } from "./mapTiles.js";
import {
  MAP_UPLOAD_BYTES,
  MAP_CHUNK_BYTES,
  MAP_MAX_PIXELS,
  MAP_MAX_EDGE,
  naturalMapDimensions,
} from "../../shared/mapImages.js";
const options = {
  region: "asia-southeast1",
  maxInstances: 3,
  serviceAccount: "merging-sun-runtime@mergingsunapp-2.iam.gserviceaccount.com",
};
const idPattern = /^[a-zA-Z0-9_-]{20,80}$/;
const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
function uploadRef(id: unknown) {
  if (typeof id !== "string" || !idPattern.test(id))
    throw new HttpsError("invalid-argument", "Invalid map upload.");
  return db.doc(`mapUploads/${id}`);
}
function ownTicket(
  ticket: FirebaseFirestore.DocumentData | undefined,
  uid: string,
) {
  if (!ticket || ticket.uid !== uid)
    throw new HttpsError(
      "permission-denied",
      "This upload belongs to another admin.",
    );
  if (ticket.expiresAt < Date.now())
    throw new HttpsError(
      "failed-precondition",
      "This upload expired. Select your map again.",
    );
  return ticket;
}
export const beginMapUpload = onCall(options, async (request) => {
  await requireAdmin(request.auth);
  const { id, size, contentType, sha256 } = request.data ?? {};
  const ref = uploadRef(id),
    uid = request.auth!.uid;
  if (
    !Number.isInteger(size) ||
    size <= 0 ||
    size > MAP_UPLOAD_BYTES ||
    !["image/png", "image/jpeg", "image/webp"].includes(contentType) ||
    typeof sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(sha256)
  )
    throw new HttpsError(
      "invalid-argument",
      "Choose a JPEG, PNG, or WebP up to 25 MB.",
    );
  await db.runTransaction(async (tx) => {
    const old = await tx.get(ref);
    if (old.exists) {
      const ticket = ownTicket(old.data(), uid);
      if (
        ticket.size !== size ||
        ticket.sha256 !== sha256 ||
        ticket.contentType !== contentType
      )
        throw new HttpsError(
          "already-exists",
          "Select the original file to resume this upload.",
        );
      if (ticket.status === "failed")
        tx.update(ref, { status: "uploading", error: null });
      return;
    }
    const rateRef = db.doc(`mapUploadLimits/${uid}`),
      rate = (await tx.get(rateRef)).data();
    const fresh = !rate || Date.now() - rate.startedAt > 3600000;
    if (!fresh && rate.count >= 10)
      throw new HttpsError(
        "resource-exhausted",
        "Please wait before starting another map upload.",
      );
    tx.set(rateRef, {
      startedAt: fresh ? Date.now() : rate.startedAt,
      count: fresh ? 1 : rate.count + 1,
    });
    tx.create(ref, {
      uid,
      size,
      contentType,
      sha256,
      status: "uploading",
      progress: 0,
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });
  });
  const chunks = await ref.collection("chunks").get();
  return {
    id,
    chunkBytes: MAP_CHUNK_BYTES,
    received: Object.fromEntries(
      chunks.docs.map((d) => [String(d.data().index), d.data().hash]),
    ),
  };
});
export const uploadMapChunk = onCall(
  { ...options, concurrency: 4 },
  async (request) => {
    await requireAdmin(request.auth);
    const { id, index, data } = request.data ?? {},
      ref = uploadRef(id);
    const ticket = ownTicket((await ref.get()).data(), request.auth!.uid);
    const count = Math.ceil(ticket.size / MAP_CHUNK_BYTES);
    if (ticket.status !== "uploading")
      throw new HttpsError(
        "failed-precondition",
        "This upload has already started processing.",
      );
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= count ||
      typeof data !== "string" ||
      data.length > Math.ceil(MAP_CHUNK_BYTES / 3) * 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(data)
    )
      throw new HttpsError("invalid-argument", "Invalid map upload chunk.");
    const bytes = Buffer.from(data, "base64"),
      hash = digest(bytes);
    if (
      bytes.length !==
        Math.min(MAP_CHUNK_BYTES, ticket.size - index * MAP_CHUNK_BYTES) ||
      bytes.toString("base64") !== data
    )
      throw new HttpsError(
        "invalid-argument",
        "The map upload chunk is incomplete.",
      );
    const path = `private/mapUploads/${ticket.uid}/${id}/chunks/${index}-${hash}`;
    await bucket()
      .file(path)
      .save(bytes, {
        resumable: false,
        contentType: "application/octet-stream",
        metadata: { cacheControl: "private,no-store" },
      });
    await db.runTransaction(async (tx) => {
      const current = ownTicket((await tx.get(ref)).data(), request.auth!.uid);
      if (current.status !== "uploading")
        throw new HttpsError(
          "failed-precondition",
          "This upload has already started processing.",
        );
      tx.set(ref.collection("chunks").doc(String(index)), {
        index,
        hash,
        path,
      });
    });
    return { index, bytes: bytes.length };
  },
);
export const processMapUpload = onCall(
  { ...options, memory: "1GiB", timeoutSeconds: 540, concurrency: 1 },
  async (request) => {
    await requireAdmin(request.auth);
    const ref = uploadRef(request.data?.id),
      uid = request.auth!.uid;
    const work = await db.runTransaction(async (tx) => {
      const ticket = ownTicket((await tx.get(ref)).data(), uid);
      if (ticket.status === "ready") return { ready: ticket.result };
      if (
        ticket.status === "processing" &&
        Date.now() - ticket.startedAt < 600000
      )
        return { processing: true };
      const chunks = await tx.get(ref.collection("chunks").orderBy("index"));
      if (
        chunks.size !== Math.ceil(ticket.size / MAP_CHUNK_BYTES) ||
        chunks.docs.some((d, i) => d.data().index !== i)
      )
        throw new HttpsError(
          "failed-precondition",
          "Finish uploading all parts of this map first.",
        );
      const assetId = randomUUID();
      tx.update(ref, {
        status: "processing",
        stage: "Checking original image",
        progress: 0,
        error: null,
        startedAt: Date.now(),
        assetId,
      });
      return { ticket, chunks: chunks.docs.map((d) => d.data()), assetId };
    });
    if ("ready" in work) return work.ready;
    if ("processing" in work) return { processing: true };
    const { ticket, chunks, assetId } = work,
      startedAt = Date.now();
    const updateJob = (
      fields: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
    ) =>
      db.runTransaction(async (tx) => {
        const current = await tx.get(ref);
        if (
          current.data()?.assetId !== assetId ||
          current.data()?.status !== "processing"
        )
          throw new HttpsError(
            "aborted",
            "This map upload was resumed by another request.",
          );
        tx.update(ref, fields);
      });
    try {
      const parts: Buffer[] = [];
      for (const chunk of chunks) {
        const [part] = await bucket().file(chunk.path).download();
        if (digest(part) !== chunk.hash)
          throw new HttpsError(
            "invalid-argument",
            "An upload part is damaged. Select the map again.",
          );
        parts.push(part);
      }
      const bytes = Buffer.concat(parts);
      parts.length = 0;
      if (bytes.length !== ticket.size || digest(bytes) !== ticket.sha256)
        throw new HttpsError(
          "invalid-argument",
          "The upload did not match the original file. Select your map again.",
        );
      let width: number, height: number;
      try {
        const meta = await sharp(bytes, {
          limitInputPixels: MAP_MAX_PIXELS,
        }).metadata();
        const dimensions = meta.autoOrient ?? meta;
        if (
          !dimensions.width ||
          !dimensions.height ||
          Math.max(dimensions.width, dimensions.height) > MAP_MAX_EDGE ||
          meta.width! * meta.height! > MAP_MAX_PIXELS ||
          (meta.pages ?? 1) > 1 ||
          !["png", "jpeg", "webp"].includes(meta.format ?? "")
        )
          throw new Error();
        width = dimensions.width;
        height = dimensions.height;
      } catch {
        throw new HttpsError(
          "invalid-argument",
          "Use a still JPEG, PNG, or WebP up to 8192 pixels on its longest side and 64 megapixels in total.",
        );
      }
      const originalPath = `private/mapOriginals/${assetId}/original`;
      await bucket()
        .file(originalPath)
        .save(bytes, {
          resumable: false,
          contentType: ticket.contentType,
          metadata: { cacheControl: "private,no-store" },
        });
      const dimensions = naturalMapDimensions(width, height);
      await updateJob({ stage: "Preparing map tiles", progress: 1 });
      let lastProgress = 0;
      await prepareNaturalMapTiles(
        bytes,
        dimensions,
        async (path, buffer) => {
          await bucket()
            .file(`public/maps/${assetId}/${path}`)
            .save(buffer, {
              resumable: false,
              contentType: "image/webp",
              metadata: { cacheControl: "public,max-age=31536000,immutable" },
            });
        },
        async (progress) => {
          const step = Math.floor(progress / 5) * 5;
          if (step > lastProgress) {
            lastProgress = step;
            await updateJob({ progress: Math.min(99, step) });
          }
        },
      );
      const result = { id: assetId, ...dimensions, mapLayout: "natural" };
      await db.doc(`imageAssets/${assetId}`).set({
        kind: "map",
        createdAt: Date.now(),
        createdBy: uid,
        width,
        height,
        ...dimensions,
        mapLayout: "natural",
        originalPath,
        originalSha256: ticket.sha256,
      });
      await updateJob({
        status: "ready",
        stage: "Map ready to preview",
        progress: 100,
        result,
        finishedAt: Date.now(),
      });
      logger.info("Natural map ready", {
        assetId,
        width,
        height,
        durationMs: Date.now() - startedAt,
      });
      // Keep the private original; temporary chunks are no longer needed.
      await Promise.allSettled(
        chunks.map((chunk) => bucket().file(chunk.path).delete()),
      );
      return result;
    } catch (error) {
      const message =
        error instanceof HttpsError
          ? error.message
          : "The map could not be prepared. Try processing it again.";
      await updateJob({
        status: "failed",
        error: message,
        finishedAt: Date.now(),
      }).catch(() => {});
      logger.error("Natural map processing failed", {
        assetId,
        errorCode: (error as { code?: string }).code ?? "unknown",
        durationMs: Date.now() - startedAt,
      });
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", message);
    }
  },
);
