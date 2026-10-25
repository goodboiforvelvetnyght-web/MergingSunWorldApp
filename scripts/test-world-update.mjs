import { DEFAULT_MAP_PRESENTATION } from "../functions/lib/shared/mapPresentation.js";
import { TRAVEL_MODEL_VERSION } from "../functions/lib/shared/travelRules.js";
import assert from "node:assert/strict";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import {
  getStorage,
  connectStorageEmulator,
  ref,
  getBytes,
  uploadBytes,
} from "firebase/storage";
import { doc, getDoc } from "firebase/firestore";
import {
  commonsId,
  internalLocations,
  characterGeneration,
  populationCounts,
  DEFAULT_WORLD,
  allHexes,
  key,
  normalizeWorld,
  center,
  hexAt,
} from "../functions/lib/shared/world.js";
export async function testWorldUpdate({
  check,
  client,
  createUserWithEmailAndPassword,
  admin,
  db,
}) {
  const suffix = Date.now(),
    first = client("review-new"),
    second = client("review-neighbor"),
    outsider = client("review-outsider");
  for (const [i, c] of [first, second, outsider].entries())
    await createUserWithEmailAndPassword(
      c.auth,
      `review${suffix}-${i}@example.com`,
      "test-password-123",
    );
  // Reset the previous road fixture while preserving all existing characters safely.
  const current = (await db.doc("worlds/main").get()).data();
  const defaultWorld = await admin.call("publishWorld", {
    world: { ...DEFAULT_WORLD, version: current.version },
  });
  await check(
    "8-unit dense grids publish compactly, preserve tile data and energy, and reject smaller grids",
    async () => {
      const dense = {
        ...defaultWorld,
        radius: 8,
        tiles: {},
        mapPresentation: structuredClone(DEFAULT_MAP_PRESENTATION),
      };
      dense.mapPresentation.minZoom = 0;
      dense.mapPresentation.maxZoom = 4;
      dense.mapPresentation.icons.city.size = 40;
      for (const h of allHexes(dense))
        dense.tiles[key(h)] = {
          terrain: "plains",
          features: ["forest"],
          river: true,
          road: true,
        };
      assert(Object.keys(dense.tiles).length > 10000);
      assert(Buffer.byteLength(JSON.stringify(dense)) > 800000);
      const energyBefore = new Map(
        (await db.collection("characters").get()).docs.map((d) => [
          d.id,
          [d.data().energy, d.data().energyAt],
        ]),
      );
      const published = await admin.call("publishWorld", { world: dense });
      const stored = (await db.doc("worlds/main").get()).data();
      assert(Buffer.byteLength(JSON.stringify(stored)) < 800000);
      assert.equal(typeof stored.tiles["0,0"], "string");
      assert.deepEqual(normalizeWorld(stored), normalizeWorld(published));
      assert.deepEqual(stored.mapPresentation, dense.mapPresentation);
      for (const patch of [
        { minZoom: 5 },
        { defaultZoom: null },
        { icons: {} },
      ])
        await assert.rejects(
          admin.call("publishWorld", {
            world: {
              ...published,
              mapPresentation: { ...published.mapPresentation, ...patch },
            },
          }),
          (e) => e.code === "functions/invalid-argument",
        );
      for (const radius of [7.99, 128.01])
        await assert.rejects(
          admin.call("publishWorld", { world: { ...published, radius } }),
          (e) => e.code === "functions/invalid-argument",
        );
      await assert.rejects(
        admin.call("publishWorld", {
          world: { ...stored, tiles: { ...stored.tiles, "0,0": "06" } },
        }),
        (e) => e.code === "functions/invalid-argument",
      );
      await admin.call("publishWorld", {
        world: { ...defaultWorld, version: published.version },
      });
      for (const d of (await db.collection("characters").get()).docs)
        assert.deepEqual(
          [d.data().energy, d.data().energyAt],
          energyBefore.get(d.id),
        );
    },
  );
  const image = `data:image/png;base64,${(
    await sharp({
      create: {
        width: 30,
        height: 20,
        channels: 4,
        background: { r: 160, g: 70, b: 30, alpha: 0.6 },
      },
    })
      .png()
      .toBuffer()
  ).toString("base64")}`;
  let firstId = crypto.randomUUID(),
    secondId = crypto.randomUUID();
  const create = (c, id, extra = {}) =>
    c.call("createCharacter", {
      name: c === first ? "Reviewed Rowan" : "Room Neighbor",
      title: "Ranger",
      bio: "A public history",
      realName: "Private Name Must Stay Private",
      locationId: "emberfall",
      requestId: id,
      portrait: image,
      ...extra,
    });
  await check(
    "pending applications are private, cannot travel, and require an admin decision",
    async () => {
      const c = await create(first, firstId);
      assert.equal(c.portrait, "");
      assert.match(
        c.portraitPath,
        new RegExp(`^portraits/${first.auth.currentUser.uid}/`),
      );
      assert(
        !(await db.doc(`characters/${first.auth.currentUser.uid}`).get())
          .exists,
      );
      assert.equal(
        (
          await getDoc(
            doc(
              first.store,
              "characterApplications",
              first.auth.currentUser.uid,
            ),
          )
        ).data().status,
        "pending",
      );
      await assert.rejects(
        getDoc(
          doc(
            second.store,
            "characterApplications",
            first.auth.currentUser.uid,
          ),
        ),
        (e) => e.code === "permission-denied",
      );
      assert.match(
        (
          await first.call("getCharacterPortrait", {
            uid: first.auth.currentUser.uid,
            application: true,
          })
        ).image,
        /^data:image\/webp;base64,/,
      );
      assert.equal(
        (
          await second.call("getCharacterPortrait", {
            uid: first.auth.currentUser.uid,
            application: true,
          })
        ).image,
        "",
      );
      await assert.rejects(
        first.call("reviewCharacter", {
          uid: first.auth.currentUser.uid,
          applicationId: firstId,
          decision: "approved",
        }),
        (e) => e.code === "functions/permission-denied",
      );
      await assert.rejects(
        first.call("enterLocation", {
          locationId: "emberfall",
          internalLocationId: commonsId("emberfall"),
          generation: firstId,
        }),
      );
      await assert.rejects(
        admin.call("reviewCharacter", {
          uid: first.auth.currentUser.uid,
          applicationId: firstId,
          decision: "rejected",
          reason: "  ",
        }),
        (e) => e.code === "functions/invalid-argument",
      );
    },
  );
  await check(
    "rejected applications retain their reason and can be edited and resubmitted",
    async () => {
      await admin.call("reviewCharacter", {
        uid: first.auth.currentUser.uid,
        applicationId: firstId,
        decision: "rejected",
        reason: "Describe your home city.",
      });
      const a = (
        await getDoc(
          doc(first.store, "characterApplications", first.auth.currentUser.uid),
        )
      ).data();
      assert.equal(a.rejectionReason, "Describe your home city.");
      const id = crypto.randomUUID();
      await assert.rejects(
        create(first, id),
        (e) => e.code === "functions/failed-precondition",
      );
      await create(first, id, { expectedApplicationId: firstId });
      await assert.rejects(
        admin.call("reviewCharacter", {
          uid: first.auth.currentUser.uid,
          applicationId: firstId,
          decision: "approved",
        }),
      );
      firstId = id;
      const results = await Promise.allSettled([
        admin.call("reviewCharacter", {
          uid: first.auth.currentUser.uid,
          applicationId: id,
          decision: "approved",
        }),
        admin.call("reviewCharacter", {
          uid: first.auth.currentUser.uid,
          applicationId: id,
          decision: "rejected",
          reason: "Conflicting decision",
        }),
      ]);
      assert(results.some((r) => r.status === "fulfilled"));
      const reviewed = (
        await db
          .doc(`characterApplications/${first.auth.currentUser.uid}`)
          .get()
      ).data();
      // Exactly one decision takes effect; ensure a playable character for occupancy tests.
      assert(["approved", "rejected"].includes(reviewed.status));
      if (reviewed.status === "rejected") {
        const next = crypto.randomUUID();
        await create(first, next, { expectedApplicationId: id });
        firstId = next;
        await admin.call("reviewCharacter", {
          uid: first.auth.currentUser.uid,
          applicationId: next,
          decision: "approved",
        });
      }
      const active = (
        await db.doc(`characters/${first.auth.currentUser.uid}`).get()
      ).data();
      assert.equal(active.internalLocationId, null);
      assert.equal(active.currentLocationId, null);
    },
  );
  await check(
    "explicit city entry and leaving preserve energy, enforce room privacy, and gate travel",
    async () => {
      const uid = first.auth.currentUser.uid,
        ref = db.doc(`characters/${uid}`);
      const before = (await ref.get()).data(),
        w = (await db.doc("worlds/main").get()).data();
      assert.equal(before.currentLocationId, null);
      assert.equal(before.internalLocationId, null);
      const base = {
        locationId: "emberfall",
        generation: firstId,
        worldVersion: w.version,
      };
      await assert.rejects(
        first.call("enterLocation", {
          ...base,
          internalLocationId: "copper-stag",
        }),
        (e) => e.code === "functions/failed-precondition",
      );
      await assert.rejects(
        first.call("enterLocation", {
          ...base,
          action: "enter-city",
          locationId: "sunspire",
        }),
        (e) => e.code === "functions/failed-precondition",
      );
      await assert.rejects(
        first.call("enterLocation", {
          ...base,
          action: "enter-city",
          generation: "old-generation",
        }),
        (e) => e.code === "functions/failed-precondition",
      );
      await assert.rejects(
        first.call("enterLocation", {
          ...base,
          action: "enter-city",
          worldVersion: w.version - 1,
        }),
        (e) => e.code === "functions/failed-precondition",
      );
      await assert.rejects(
        first.call("enterLocation", { ...base, action: "invalid" }),
        (e) => e.code === "functions/invalid-argument",
      );
      const initialCounts = (await db.doc("population/main").get()).data()
        .counts;
      const inside = await first.call("enterLocation", {
        ...base,
        action: "enter-city",
      });
      assert.deepEqual(inside, {
        ...before,
        currentLocationId: "emberfall",
        internalLocationId: null,
      });
      assert.equal(
        (await db.doc("population/main").get()).data().counts.emberfall,
        (initialCounts.emberfall ?? 0) + 1,
      );
      await assert.rejects(
        first.call("getRoomCharacters", {}),
        (e) => e.code === "functions/permission-denied",
      );
      await assert.rejects(
        first.call("travel", {
          destination: DEFAULT_WORLD.locations[1],
          worldVersion: w.version,
          generation: firstId,
          travelModel: TRAVEL_MODEL_VERSION,
          requestId: crypto.randomUUID(),
        }),
        (e) =>
          e.code === "functions/failed-precondition" &&
          e.message.includes("Leave the city"),
      );
      const room = await first.call("enterLocation", {
        ...base,
        internalLocationId: "copper-stag",
      });
      assert.deepEqual(
        await first.call("enterLocation", { ...base, action: "enter-city" }),
        room,
        "retrying city entry must keep the selected room",
      );
      await assert.rejects(
        first.call("enterLocation", {
          ...base,
          action: "leave-city",
          locationId: "sunspire",
        }),
        (e) => e.code === "functions/failed-precondition",
      );
      assert.deepEqual(
        await first.call("enterLocation", { ...base, action: "leave-city" }),
        before,
      );
      assert.deepEqual(
        await first.call("enterLocation", { ...base, action: "leave-city" }),
        before,
      );
      await assert.rejects(
        first.call("getRoomCharacters", {}),
        (e) => e.code === "functions/permission-denied",
      );
      assert.equal(
        (await db.doc("population/main").get()).data().counts.emberfall ?? 0,
        initialCounts.emberfall ?? 0,
      );
      // Real travel to a city stops outside, including the return journey.
      for (const dest of [
        DEFAULT_WORLD.locations[1],
        DEFAULT_WORLD.locations[0],
      ]) {
        const result = await first.call("travel", {
          destination: dest,
          worldVersion: w.version,
          generation: firstId,
          travelModel: TRAVEL_MODEL_VERSION,
          requestId: crypto.randomUUID(),
        });
        assert.equal(result.character.currentLocationId, null);
        assert.equal(result.character.internalLocationId, null);
      }
    },
  );
  await check(
    "same-room profiles exclude real names and review data; other locations cannot inspect",
    async () => {
      await create(second, secondId);
      await admin.call("reviewCharacter", {
        uid: second.auth.currentUser.uid,
        applicationId: secondId,
        decision: "approved",
      });
      for (const [client, generation] of [
        [first, firstId],
        [second, secondId],
      ]) {
        await client.call("enterLocation", {
          action: "enter-city",
          locationId: "emberfall",
          generation,
        });
        await client.call("enterLocation", {
          locationId: "emberfall",
          internalLocationId: commonsId("emberfall"),
          generation,
        });
      }
      const people = await first.call("getRoomCharacters", {}),
        p = people.find((p) => p.uid === second.auth.currentUser.uid);
      assert(p);
      assert.equal(p.bio, "A public history");
      assert(!("realName" in p));
      assert(!("rejectionReason" in p));
      assert(!("energy" in p));
      assert(!JSON.stringify(people).includes("Private Name"));
      assert.match(
        (
          await first.call("getCharacterPortrait", {
            uid: second.auth.currentUser.uid,
          })
        ).image,
        /^data:image\/webp;base64,/,
      );
      await assert.rejects(
        outsider.call("getRoomCharacters", {}),
        (e) => e.code === "functions/permission-denied",
      );
      await assert.rejects(
        outsider.call("getCharacterPortrait", {
          uid: second.auth.currentUser.uid,
        }),
        (e) => e.code === "functions/permission-denied",
      );
      await first.call("enterLocation", {
        locationId: "emberfall",
        internalLocationId: "copper-stag",
        generation: firstId,
      });
      assert(
        !(await first.call("getRoomCharacters", {})).some(
          (p) => p.uid === second.auth.currentUser.uid,
        ),
      );
      await assert.rejects(
        first.call("getCharacterPortrait", {
          uid: second.auth.currentUser.uid,
        }),
        (e) => e.code === "functions/permission-denied",
      );
      await assert.rejects(
        first.call("enterLocation", {
          locationId: "sunspire",
          internalLocationId: commonsId("sunspire"),
          generation: firstId,
        }),
      );
      await assert.rejects(
        first.call("enterLocation", {
          locationId: "emberfall",
          internalLocationId: "invented-room",
          generation: firstId,
        }),
      );
    },
  );
  await check(
    "Storage denies direct portrait downloads and every client upload",
    async () => {
      const storage = getStorage(
        first.auth.app,
        "gs://demo-merging-sun.appspot.com",
      );
      connectStorageEmulator(storage, "127.0.0.1", 9199);
      const c = (
        await db.doc(`characters/${first.auth.currentUser.uid}`).get()
      ).data();
      await assert.rejects(
        getBytes(ref(storage, c.portraitPath)),
        (e) => e.code === "storage/unauthorized",
      );
      await assert.rejects(
        uploadBytes(
          ref(storage, "public/fake.webp"),
          new Uint8Array([1, 2, 3]),
        ),
        (e) => e.code === "storage/unauthorized",
      );
    },
  );
  let emblem, map, cover;
  await check(
    "admin images preserve flag proportions and generate complete public map tiles",
    async () => {
      await assert.rejects(
        first.call("uploadWorldAsset", { kind: "emblem", image }),
        (e) => e.code === "functions/permission-denied",
      );
      await assert.rejects(
        admin.call("uploadWorldAsset", {
          kind: "emblem",
          image: "data:image/png;base64,AAAA",
        }),
        (e) => e.code === "functions/invalid-argument",
      );
      emblem = (await admin.call("uploadWorldAsset", { kind: "emblem", image }))
        .id;
      cover = (await admin.call("uploadWorldAsset", { kind: "cover", image }))
        .id;
      await assert.rejects(
        first.call("uploadWorldAsset", { kind: "cover", image }),
        (e) => e.code === "functions/permission-denied",
      );
      map = (await admin.call("uploadWorldAsset", { kind: "map", image })).id;
      const storage = getStorage(
        first.auth.app,
        "gs://demo-merging-sun.appspot.com",
      );
      const coverBytes = await getBytes(
        ref(storage, `public/covers/${cover}/image.webp`),
      );
      const coverMeta = await sharp(Buffer.from(coverBytes)).metadata();
      assert.equal(coverMeta.format, "webp");
      assert(coverMeta.width <= 1920 && coverMeta.height <= 1920);
      const flag = Buffer.from(
        await getBytes(ref(storage, `public/emblems/${emblem}/image.webp`)),
      );
      const meta = await sharp(flag).metadata();
      assert.equal(meta.width / meta.height, 1.5);
      assert(meta.hasAlpha);
      for (const path of [
        `public/maps/${map}/tiles/0/0/0.webp`,
        `public/maps/${map}/tiles/3/9/7.webp`,
        `public/maps/${map}/overview.webp`,
      ])
        assert((await getBytes(ref(storage, path))).byteLength > 0);
      // A detailed, multi-megabyte JPG exercises the path that timed out in production.
      const detailedJpg = await sharp(randomBytes(3969 * 1814 * 3), {
        raw: { width: 3969, height: 1814, channels: 3 },
      })
        .blur(1)
        .jpeg({ quality: 88 })
        .toBuffer();
      assert(
        detailedJpg.length > 2000000 && detailedJpg.length < 6 * 1024 * 1024,
      );
      const largeImage = `data:image/jpeg;base64,${detailedJpg.toString("base64")}`;
      const highResolution = await admin.call("uploadWorldAsset", {
        kind: "map",
        image: largeImage,
      });
      assert.equal(highResolution.nativeZoom, 4);
      assert(
        (
          await getBytes(
            ref(storage, `public/maps/${highResolution.id}/tiles/4/18/14.webp`),
          )
        ).byteLength > 0,
      );
      const detailTile = Buffer.from(
        await getBytes(
          ref(storage, `public/maps/${highResolution.id}/tiles/4/8/6.webp`),
        ),
      );
      const detailMeta = await sharp(detailTile).metadata();
      assert.equal(detailMeta.width, 256);
      assert.equal(detailMeta.height, 256);
      assert((await sharp(detailTile).stats()).channels[0].stdev > 1);
      map = highResolution.id;
    },
  );
  await check(
    "publishing artwork does not move characters; population remains accurate after movement and deletion",
    async () => {
      const w = (await db.doc("worlds/main").get()).data(),
        before = (
          await db.doc(`characters/${first.auth.currentUser.uid}`).get()
        ).data();
      await assert.rejects(
        admin.call("publishWorld", {
          world: { ...w, mapAssetId: crypto.randomUUID() },
        }),
        (e) => e.code === "functions/failed-precondition",
      );
      for (const patch of [
        { coverPosition: -1 },
        { coverPosition: 101 },
        { coverAssetId: emblem },
        { coverAssetId: crypto.randomUUID() },
      ])
        await assert.rejects(
          admin.call("publishWorld", {
            world: {
              ...w,
              locations: w.locations.map((l, i) =>
                i === 0 ? { ...l, ...patch } : l,
              ),
            },
          }),
          (e) =>
            [
              "functions/invalid-argument",
              "functions/failed-precondition",
            ].includes(e.code),
        );
      const updated = await admin.call("publishWorld", {
        world: {
          ...w,
          mapAssetId: map,
          locations: w.locations.map((l, i) =>
            i === 0 ? { ...l, coverAssetId: cover, coverPosition: 23 } : l,
          ),
          territories: w.territories.map((k) => ({
            ...k,
            emblemAssetId: emblem,
            emblemPosition: { x: 300, y: 400 },
          })),
        },
      });
      assert.deepEqual(
        (await db.doc(`characters/${first.auth.currentUser.uid}`).get()).data(),
        before,
      );
      assert.equal(updated.locations[0].coverAssetId, cover);
      assert.equal(updated.locations[0].coverPosition, 23);
      assert.equal(updated.mapAssetId, map);
      assert.equal(updated.mapNativeZoom, 4);
      assert.equal(updated.territories[0].emblemAssetId, emblem);
      const chars = (await db.collection("characters").get()).docs.map((d) =>
        d.data(),
      );
      const counts = (await db.doc("population/main").get()).data().counts;
      assert.deepEqual(counts, populationCounts(chars, updated));
      const grid = await admin.call("publishWorld", {
        world: { ...updated, offsetX: 8 },
      });
      const c = (
        await db.doc(`characters/${first.auth.currentUser.uid}`).get()
      ).data();
      assert.equal(c.internalLocationId, null);
      assert.equal(c.currentLocationId, null);
      assert.equal(c.energy, before.energy);
      const gone = await admin.call("publishWorld", {
        world: {
          ...grid,
          locations: grid.locations.filter((l) => l.id !== "emberfall"),
        },
      });
      const orphan = (
        await db.doc(`characters/${first.auth.currentUser.uid}`).get()
      ).data();
      assert.equal(orphan.originLocationId, null);
      assert.equal(orphan.internalLocationId, null);
      assert.equal(orphan.x, c.x);
      assert.equal(orphan.y, c.y);
      const moved = await admin.call("publishWorld", {
        world: { ...gone, offsetX: 12 },
      });
      const kept = (
        await db.doc(`characters/${first.auth.currentUser.uid}`).get()
      ).data();
      assert.equal(kept.x, c.x);
      assert.equal(kept.y, c.y);
      assert.deepEqual(
        (await db.doc("population/main").get()).data().counts,
        populationCounts(
          (await db.collection("characters").get()).docs.map((d) => d.data()),
          moved,
        ),
      );
    },
  );
  await check(
    "harbour travel validates departure, charges flat energy atomically, retries once, and updates population",
    async () => {
      const current = (await db.doc("worlds/main").get()).data();
      const fixture = {
        ...DEFAULT_WORLD,
        version: current.version,
        travelRules: { ...defaultWorld.travelRules, sailingCost: 7 },
        locations: DEFAULT_WORLD.locations.map((l) => ({
          ...l,
          harbour: ["emberfall", "sunspire"].includes(l.id),
        })),
      };
      const w = await admin.call("publishWorld", { world: fixture });
      const ref = db.doc(`characters/${first.auth.currentUser.uid}`);
      const old = (await ref.get()).data();
      const start = {
        ...old,
        ...center(
          hexAt(
            w.locations.find((l) => l.id === "emberfall"),
            w,
          ),
          w,
        ),
        currentLocationId: "emberfall",
        internalLocationId: "copper-stag",
        energy: 30,
        energyAt: Date.now(),
      };
      await ref.set(start);
      const pop = db.doc("population/main");
      await pop.set({
        ...(await pop.get()).data(),
        counts: populationCounts(
          (await db.collection("characters").get()).docs.map((d) => d.data()),
          w,
        ),
      });
      const data = {
        mode: "ship",
        fromLocationId: "emberfall",
        destinationLocationId: "sunspire",
        worldVersion: w.version,
        generation: characterGeneration(start),
        requestId: crypto.randomUUID(),
      };
      for (const patch of [
        { destinationLocationId: "emberfall" },
        { destinationLocationId: "thornwatch" },
        { fromLocationId: "sunspire" },
        { worldVersion: w.version - 1 },
        { generation: "stale-generation" },
      ])
        await assert.rejects(
          first.call("travel", { ...data, ...patch }),
          (e) => e.code === "functions/failed-precondition",
        );
      const results = await Promise.all([
        first.call("travel", data),
        first.call("travel", data),
      ]);
      assert.equal(results[0].journey.cost, 7);
      const arrived = (await ref.get()).data();
      assert.equal(arrived.energy, 23);
      assert.equal(arrived.currentLocationId, "sunspire");
      assert.equal(arrived.internalLocationId, null);
      assert.deepEqual(
        { x: arrived.x, y: arrived.y },
        center(
          hexAt(
            w.locations.find((l) => l.id === "sunspire"),
            w,
          ),
          w,
        ),
      );
      await first.call("travel", data);
      assert.equal((await ref.get()).data().energy, 23);
      await assert.rejects(
        first.call("travel", { ...data, requestId: crypto.randomUUID() }),
        (e) => e.code === "functions/failed-precondition",
      );
      await ref.update({ energy: 0, energyAt: Date.now() });
      await assert.rejects(
        first.call("travel", {
          ...data,
          fromLocationId: "sunspire",
          destinationLocationId: "emberfall",
          requestId: crypto.randomUUID(),
        }),
        (e) => e.code === "functions/failed-precondition",
      );
      assert.deepEqual(
        Object.fromEntries(
          Object.entries((await pop.get()).data().counts).filter(
            ([, count]) => count > 0,
          ),
        ),
        populationCounts(
          (await db.collection("characters").get()).docs.map((d) => d.data()),
          w,
        ),
      );
      await assert.rejects(
        admin.call("publishWorld", {
          world: {
            ...w,
            locations: w.locations.map((l) => ({ ...l, harbour: "yes" })),
          },
        }),
        (e) => e.code === "functions/invalid-argument",
      );
    },
  );
  await check(
    "existing portraits migrate privately without changing character position or energy",
    async () => {
      const ref = db.doc(`characters/${second.auth.currentUser.uid}`),
        before = (await ref.get()).data();
      await ref.set({ ...before, portrait: image, portraitPath: "" });
      const result = await admin.call("migrateLegacyPortraits", {});
      assert.equal(result.migrated, 1);
      const after = (await ref.get()).data();
      assert.equal(after.portrait, "");
      assert(after.portraitPath);
      assert.equal(after.energy, before.energy);
      assert.equal(after.x, before.x);
      assert.equal(
        (await admin.call("migrateLegacyPortraits", {})).migrated,
        0,
      );
    },
  );
}
