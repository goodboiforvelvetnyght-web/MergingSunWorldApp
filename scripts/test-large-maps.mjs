import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import sharp from "sharp";
import {
  getStorage,
  connectStorageEmulator,
  ref,
  getBytes,
} from "firebase/storage";
import { doc, getDoc } from "firebase/firestore";
import { getStorage as adminStorage } from "../functions/node_modules/firebase-admin/lib/storage/index.js";
import { MAP_CHUNK_BYTES } from "../functions/lib/shared/mapImages.js";
import {
  alignMapArtwork,
  mapTransform,
  transformPoint,
  alignedGrid,
} from "../functions/lib/shared/mapAlignment.js";
import {
  DEFAULT_WORLD,
  center,
  hexAt,
  key,
  tileAt,
  populationCounts,
} from "../functions/lib/shared/world.js";
const hash = (b) => createHash("sha256").update(b).digest("hex");
export async function testLargeMaps({ check, admin, player, other, db }) {
  const storage = getStorage(
    player.auth.app,
    "gs://demo-merging-sun.appspot.com",
  );
  // This SDK instance may already be connected by earlier fixtures.
  try {
    connectStorageEmulator(storage, "127.0.0.1", 9199);
  } catch {}
  const bucket = adminStorage().bucket("demo-merging-sun.appspot.com");
  const small = await sharp({
    create: { width: 400, height: 200, channels: 3, background: "#bb8844" },
  })
    .png()
    .toBuffer();
  const start = async (bytes, extras = {}, id = crypto.randomUUID()) => {
    await admin.call("beginMapUpload", {
      id,
      size: bytes.length,
      sha256: hash(bytes),
      contentType: "image/png",
      ...extras,
    });
    return id;
  };
  const send = async (id, bytes) => {
    for (
      let index = 0;
      index < Math.ceil(bytes.length / MAP_CHUNK_BYTES);
      index++
    )
      await admin.call("uploadMapChunk", {
        id,
        index,
        data: bytes
          .subarray(index * MAP_CHUNK_BYTES, (index + 1) * MAP_CHUNK_BYTES)
          .toString("base64"),
      });
  };
  let smallArt, largeArt, smallId;
  await check(
    "large-map tickets, chunks, progress and originals remain admin-controlled and private",
    async () => {
      await assert.rejects(
        player.call("beginMapUpload", {
          id: crypto.randomUUID(),
          size: small.length,
          contentType: "image/png",
          sha256: hash(small),
        }),
        (e) => e.code === "functions/permission-denied",
      );
      await assert.rejects(
        admin.call("beginMapUpload", {
          id: crypto.randomUUID(),
          size: 25 * 1024 * 1024 + 1,
          contentType: "image/jpeg",
          sha256: hash(small),
        }),
        (e) => e.code === "functions/invalid-argument",
      );
      smallId = await start(small);
      await assert.rejects(
        getDoc(doc(player.store, "mapUploads", smallId)),
        (e) => e.code === "permission-denied",
      );
      await assert.rejects(
        player.call("uploadMapChunk", {
          id: smallId,
          index: 0,
          data: small.toString("base64"),
        }),
        (e) => e.code === "functions/permission-denied",
      );
      await assert.rejects(
        player.call("processMapUpload", { id: smallId }),
        (e) => e.code === "functions/permission-denied",
      );
      await assert.rejects(
        admin.call("processMapUpload", { id: smallId }),
        (e) => e.code === "functions/failed-precondition",
      );
      await assert.rejects(
        admin.call("uploadMapChunk", {
          id: smallId,
          index: 1,
          data: small.toString("base64"),
        }),
        (e) => e.code === "functions/invalid-argument",
      );
      await db
        .doc(`adminRoles/${other.auth.currentUser.uid}`)
        .set({ role: "admin" });
      await assert.rejects(
        other.call("processMapUpload", { id: smallId }),
        (e) => e.code === "functions/permission-denied",
      );
      await db.doc(`adminRoles/${other.auth.currentUser.uid}`).delete();
      // Uploading the same acknowledged chunk again is safe after a network interruption.
      await send(smallId, small);
      await send(smallId, small);
      const acknowledged = await admin.call("beginMapUpload", {
        id: smallId,
        size: small.length,
        contentType: "image/png",
        sha256: hash(small),
      });
      assert.equal(acknowledged.received["0"], hash(small));
      const once = await admin.call("processMapUpload", { id: smallId });
      smallArt = await admin.call("processMapUpload", { id: smallId });
      assert.deepEqual(smallArt, once);
      assert.equal(smallArt.mapLayout, "natural");
      assert.equal(smallArt.mapWidth / smallArt.mapHeight, 2);
      const job = (
        await getDoc(doc(admin.store, "mapUploads", smallId))
      ).data();
      assert.equal(job.progress, 100);
      assert.equal(job.status, "ready");
      const manifest = (
        await db.doc(`imageAssets/${smallArt.id}`).get()
      ).data();
      assert.equal(manifest.originalSha256, hash(small));
      assert.equal(
        hash((await bucket.file(manifest.originalPath).download())[0]),
        hash(small),
      );
      await assert.rejects(
        getBytes(ref(storage, manifest.originalPath)),
        (e) => e.code === "storage/unauthorized",
      );
      const overview = await sharp(
        Buffer.from(
          await getBytes(
            ref(storage, `public/maps/${smallArt.id}/overview.webp`),
          ),
        ),
      ).metadata();
      assert.equal(overview.width / overview.height, 2);
      const tile = await sharp(
        Buffer.from(
          await getBytes(
            ref(storage, `public/maps/${smallArt.id}/tiles/0/0/0.webp`),
          ),
        ),
      )
        .raw()
        .toBuffer({ resolveWithObject: true });
      assert.equal(tile.info.channels, 4);
      assert.equal(
        tile.data[(256 * 256 - 1) * 4 + 3],
        0,
        "edge-tile padding must be transparent",
      );
      assert(
        tile.data[0] > 170,
        "the map starts at the top-left, without old aspect-ratio padding",
      );
    },
  );
  await check(
    "8192-pixel JPEG larger than 6 MB uploads in chunks and produces the full-resolution pyramid",
    async () => {
      const bytes = await sharp(randomBytes(8192 * 1337 * 3), {
        raw: { width: 8192, height: 1337, channels: 3 },
      })
        .jpeg({ quality: 85 })
        .toBuffer();
      assert(bytes.length > 6 * 1024 * 1024 && bytes.length < 25 * 1024 * 1024);
      const id = await start(bytes, { contentType: "image/jpeg" });
      await send(id, bytes);
      largeArt = await admin.call("processMapUpload", { id });
      assert.equal(largeArt.nativeZoom, 5);
      assert.equal(largeArt.mapWidth, 2048);
      const edge = await sharp(
        Buffer.from(
          await getBytes(
            ref(storage, `public/maps/${largeArt.id}/tiles/5/31/5.webp`),
          ),
        ),
      ).metadata();
      assert.equal(edge.width, 256);
      assert.equal(edge.height, 256);
      assert.deepEqual(await admin.call("processMapUpload", { id }), largeArt);
      const job = (await db.doc(`mapUploads/${id}`).get()).data();
      assert.equal(job.status, "ready");
      assert(
        !(
          await bucket
            .file(
              `private/mapUploads/${admin.auth.currentUser.uid}/${id}/chunks/0-${hash(bytes.subarray(0, MAP_CHUNK_BYTES))}`,
            )
            .exists()
        )[0],
      );
    },
  );
  await check(
    "dimension checks and file checksums reject unsafe or incomplete originals",
    async () => {
      const oversized = await sharp({
        create: { width: 8193, height: 2, channels: 3, background: "#aa7744" },
      })
        .png()
        .toBuffer();
      const tooWide = await start(oversized);
      await send(tooWide, oversized);
      await assert.rejects(
        admin.call("processMapUpload", { id: tooWide }),
        (e) =>
          e.code === "functions/invalid-argument" && /8192/.test(e.message),
      );
      const wrongHash = await start(small, { sha256: "0".repeat(64) });
      await send(wrongHash, small);
      await assert.rejects(
        admin.call("processMapUpload", { id: wrongHash }),
        (e) => e.code === "functions/invalid-argument",
      );
      assert.equal(
        (await db.doc(`mapUploads/${wrongHash}`).get()).data().status,
        "failed",
      );
      // Correcting a failed upload uses a new ticket; a partial asset never becomes publishable.
      const assetId = (await db.doc(`mapUploads/${wrongHash}`).get()).data()
        .assetId;
      assert(!(await db.doc(`imageAssets/${assetId}`).get()).exists);
    },
  );
  await check(
    "map alignment preserves characters, terrain, rooms, population and energy atomically",
    async () => {
      const previous = (await db.doc("worlds/main").get()).data();
      const chars = (await db.collection("characters").get()).docs;
      const nextDraft = alignMapArtwork(previous, smallArt, "fit");
      const t = mapTransform(previous, nextDraft, "fit");
      const next = await admin.call("publishWorld", { world: nextDraft });
      assert.equal(next.mapAlignment, undefined);
      assert.equal(next.mapWidth, smallArt.mapWidth);
      const updated = [];
      for (const c of chars) {
        const old = c.data(),
          moved = (await c.ref.get()).data();
        const position = transformPoint(old, t);
        assert(
          Math.abs(moved.x - position.x) < 1e-6 &&
            Math.abs(moved.y - position.y) < 1e-6,
        );
        assert.equal(moved.energy, old.energy);
        assert.equal(moved.energyAt, old.energyAt);
        assert.equal(moved.incarnationId, old.incarnationId);
        assert.equal(moved.internalLocationId, old.internalLocationId);
        const oldTile = tileAt(hexAt(old, previous), previous),
          newTile = tileAt(hexAt(moved, next), next);
        assert.deepEqual(newTile, { ...oldTile, road: oldTile.road ?? false });
        updated.push(moved);
      }
      assert.deepEqual(
        (await db.doc("population/main").get()).data().counts,
        populationCounts(updated, next),
      );
      assert((await db.doc(`worldBackups/${previous.version}`).get()).exists);
      // A sharper image with the same proportions changes no map coordinates or grid scale.
      const sharperId = crypto.randomUUID();
      await db
        .doc(`imageAssets/${sharperId}`)
        .set({ kind: "map", ...smallArt, id: sharperId, nativeZoom: 5 });
      const sharper = await admin.call("publishWorld", {
        world: { ...next, mapAssetId: sharperId },
      });
      assert.equal(sharper.radius, next.radius);
      assert.equal(sharper.mapNativeZoom, 5);
      for (const [i, c] of chars.entries())
        assert.deepEqual((await c.ref.get()).data(), updated[i]);
      await assert.rejects(
        admin.call("publishWorld", { world: { ...sharper, mapWidth: 1234 } }),
        (e) =>
          [
            "functions/failed-precondition",
            "functions/invalid-argument",
          ].includes(e.code),
      );
      const bogus = {
        ...alignMapArtwork(
          sharper,
          { id: null, nativeZoom: 3, mapWidth: 2400, mapHeight: 1800 },
          "fit",
        ),
      };
      delete bogus.mapAlignment;
      await assert.rejects(
        admin.call("publishWorld", { world: bogus }),
        (e) => e.code === "functions/failed-precondition",
      );
    },
  );
  await check(
    "removing old padding blocks a character outside the artwork and preserves orphaned origins",
    async () => {
      // An isolated legacy fixture allows a realistic same-artwork migration without relying on the demo geography.
      const version = (await db.doc("worlds/main").get()).data().version;
      const previous = {
        ...structuredClone(DEFAULT_WORLD),
        version,
        mapAssetId: "old",
        territories: [],
        locations: [],
        tiles: {},
        terrainBase: "water",
      };
      const chars = (await db.collection("characters").get()).docs;
      for (const c of chars) {
        const p = center(hexAt({ x: 1200, y: 900 }, previous), previous);
        previous.tiles[key(hexAt(p, previous))] = {
          terrain: "plains",
          river: false,
          road: true,
        };
        await c.ref.set({
          ...c.data(),
          ...p,
          originLocationId: null,
          currentLocationId: null,
          internalLocationId: null,
        });
      }
      await db.doc("worlds/main").set(previous);
      const crop = alignMapArtwork(previous, smallArt, "unpad");
      const first = chars[0];
      const safe = (await first.ref.get()).data();
      await first.ref.update({ y: 10 });
      await assert.rejects(
        admin.call("publishWorld", { world: crop }),
        (e) =>
          e.code === "functions/failed-precondition" &&
          /outside the new map/.test(e.message),
      );
      assert.equal((await db.doc("worlds/main").get()).data().version, version);
      await first.ref.set(safe);
      const next = await admin.call("publishWorld", { world: crop });
      const t = alignedGrid(previous, crop, "unpad").transform;
      const actual = (await first.ref.get()).data(),
        expected = transformPoint(safe, t);
      assert(
        Math.abs(actual.x - expected.x) < 1e-6 &&
          Math.abs(actual.y - expected.y) < 1e-6,
      );
      const grid = await admin.call("publishWorld", {
        world: { ...next, offsetX: next.offsetX + 1 },
      });
      assert.equal((await first.ref.get()).data().x, actual.x);
      assert.equal(grid.offsetX, next.offsetX + 1);
    },
  );
}
