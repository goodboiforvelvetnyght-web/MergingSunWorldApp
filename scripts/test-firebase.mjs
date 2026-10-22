import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { initializeApp as clientApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import {
  getFirestore as clientDb,
  connectFirestoreEmulator,
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "firebase/functions";
import { initializeApp as adminApp } from "../functions/node_modules/firebase-admin/lib/app/index.js";
import { getFirestore } from "../functions/node_modules/firebase-admin/lib/firestore/index.js";
import { getAuth as adminAuth } from "../functions/node_modules/firebase-admin/lib/auth/index.js";
import {
  DEFAULT_WORLD,
  allHexes,
  key,
  removeKingdom,
  hexAt,
  center,
  findRoute,
} from "../functions/lib/shared/world.js";
const projectId = "demo-merging-sun";
adminApp({ projectId });
const db = getFirestore();
function client(name) {
  const app = clientApp(
    { apiKey: "demo-key", projectId, authDomain: "localhost" },
    name,
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const store = clientDb(app);
  connectFirestoreEmulator(store, "127.0.0.1", 8080);
  const functions = getFunctions(app, "asia-southeast1");
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  return {
    auth,
    store,
    call: (n, data) =>
      httpsCallable(functions, n, {
        timeout: n === "processMapUpload" ? 600000 : 70000,
      })(data).then((r) => r.data),
  };
}
const player = client("player"),
  other = client("other"),
  admin = client("admin");
let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
}
try {
  const salt = Date.now();
  let generation;
  const p = await createUserWithEmailAndPassword(
    player.auth,
    `player${salt}@example.com`,
    "test-password-123",
  );
  await createUserWithEmailAndPassword(
    other.auth,
    `other${salt}@example.com`,
    "test-password-123",
  );
  const a = await createUserWithEmailAndPassword(
    admin.auth,
    `admin${salt}@example.com`,
    "test-password-123",
  );
  await adminAuth().setCustomUserClaims(a.user.uid, { admin: true });
  await a.user.getIdToken(true);
  await check(
    "public world is readable and defaults are available",
    async () => {
      await getDoc(doc(player.store, "worlds/main"));
    },
  );
  await check(
    "character creation records origin and is limited to one",
    async () => {
      const c = await player.call("createCharacter", {
        name: "Rowan",
        title: "Warden",
        bio: "Test",
        locationId: "emberfall",
        realName: "Private Player Name",
        requestId: crypto.randomUUID(),
      });
      generation = c.incarnationId;
      assert.equal(
        (await db.doc(`characters/${p.user.uid}`).get()).exists,
        false,
      );
      await assert.rejects(
        player.call("travel", {
          destination: { x: 1000, y: 900 },
          worldVersion: 0,
          requestId: crypto.randomUUID(),
          generation,
        }),
      );
      await admin.call("reviewCharacter", {
        uid: p.user.uid,
        applicationId: generation,
        decision: "approved",
      });
      assert.equal(c.realName, "Private Player Name");
      assert.equal(c.originLocationId, "emberfall");
      assert.equal(c.energy, 100);
      await assert.rejects(
        player.call("createCharacter", {
          name: "Duplicate",
          title: "",
          bio: "",
          locationId: "emberfall",
          realName: "Private Player Name",
          requestId: crypto.randomUUID(),
        }),
        (e) => e.code === "functions/already-exists",
      );
    },
  );
  await check(
    "players cannot directly change energy or another character",
    async () => {
      await assert.rejects(
        setDoc(doc(player.store, `characters/${p.user.uid}`), { energy: 999 }),
        (e) => e.code === "permission-denied",
      );
      await assert.rejects(
        getDoc(doc(other.store, `characters/${p.user.uid}`)),
        (e) => e.code === "permission-denied",
      );
    },
  );
  await check("non-admin publishing is rejected", async () => {
    await assert.rejects(
      player.call("publishWorld", { world: DEFAULT_WORLD }),
      (e) => e.code === "functions/permission-denied",
    );
  });
  const destination = center(
    hexAt(
      DEFAULT_WORLD.locations.find((l) => l.id === "thornwatch"),
      DEFAULT_WORLD,
    ),
    DEFAULT_WORLD,
  );
  const before = (await db.doc(`characters/${p.user.uid}`).get()).data();
  const route = findRoute(
    hexAt(before, DEFAULT_WORLD),
    hexAt(destination, DEFAULT_WORLD),
    DEFAULT_WORLD,
  );
  assert(route && route.cost < 100);
  await check(
    "travel computes authoritative cost and duplicate requests charge once",
    async () => {
      const data = {
        destination,
        worldVersion: 0,
        generation,
        requestId: crypto.randomUUID(),
        cost: 0,
      };
      const results = await Promise.all([
        player.call("travel", data),
        player.call("travel", data),
      ]);
      assert.equal(results[0].character.energy, 100 - route.cost);
      const saved = (await db.doc(`characters/${p.user.uid}`).get()).data();
      assert.equal(saved.energy, 100 - route.cost);
      assert.equal(saved.x, destination.x);
      assert.equal(
        (
          await db
            .collection(
              `characters/${p.user.uid}/incarnations/${generation}/journeys`,
            )
            .get()
        ).size,
        1,
      );
    },
  );
  await check("stale-world travel is rejected", async () => {
    await assert.rejects(
      player.call("travel", {
        destination: { x: 1090, y: 945 },
        worldVersion: 99,
        generation,
        requestId: crypto.randomUUID(),
      }),
      (e) => e.code === "functions/failed-precondition",
    );
  });
  await check("insufficient energy is rejected without moving", async () => {
    await db
      .doc(`characters/${p.user.uid}`)
      .update({ energy: 0, energyAt: Date.now() });
    await assert.rejects(
      player.call("travel", {
        destination: { x: 1090, y: 945 },
        worldVersion: 0,
        generation,
        requestId: crypto.randomUUID(),
      }),
      (e) => e.code === "functions/failed-precondition",
    );
    assert.equal(
      (await db.doc(`characters/${p.user.uid}`).get()).data().x,
      destination.x,
    );
  });
  await check(
    "admin grid publishing resets characters to origin and preserves energy",
    async () => {
      await db.doc(`characters/${p.user.uid}`).update({ energy: 63 });
      const next = { ...DEFAULT_WORLD, radius: 48 };
      const w = await admin.call("publishWorld", { world: next });
      assert.equal(w.version, 1);
      const c = (await db.doc(`characters/${p.user.uid}`).get()).data(),
        origin = center(hexAt(next.locations[0], next), next);
      assert.equal(c.x, origin.x);
      assert.equal(c.y, origin.y);
      assert.equal(c.energy, 63);
      assert.equal(c.originLocationId, "emberfall");
      assert((await db.doc("worldBackups/0").get()).exists);
    },
  );
  await check(
    "publishing rejects dangling parents, duplicate IDs, and missing borders",
    async () => {
      const current = (await db.doc("worlds/main").get()).data();
      const broken = [
        {
          ...current,
          locations: current.locations.map((l, i) =>
            i === 0 ? { ...l, kingdomId: "missing" } : l,
          ),
        },
        {
          ...current,
          territories: [...current.territories, current.territories[0]],
        },
        {
          ...current,
          territories: current.territories.map((k, i) =>
            i === 0 ? { ...k, points: [] } : k,
          ),
        },
        {
          ...current,
          locations: current.locations.map((l, i) =>
            i === 0 ? { ...l, entries: [...l.entries, l.entries[0]] } : l,
          ),
        },
        {
          ...current,
          locations: [
            ...current.locations,
            {
              ...current.locations[0],
              id: "independent-new",
              kingdomId: null,
              entries: [],
            },
          ],
        },
      ];
      for (const world of broken)
        await assert.rejects(
          admin.call("publishWorld", { world }),
          (e) => e.code === "functions/invalid-argument",
        );
      assert.equal(
        (await db.doc("worlds/main").get()).data().version,
        current.version,
      );
    },
  );
  await check(
    "allegiance transfers preserve entries and do not enforce border containment",
    async () => {
      const current = (await db.doc("worlds/main").get()).data();
      const city = current.locations.find((l) => l.id === "emberfall");
      const before = (await db.doc(`characters/${p.user.uid}`).get()).data();
      const world = await admin.call("publishWorld", {
        world: {
          ...current,
          locations: current.locations.map((l) =>
            l.id === city.id ? { ...l, kingdomId: "coast" } : l,
          ),
        },
      });
      const transferred = world.locations.find((l) => l.id === city.id);
      assert.equal(transferred.kingdomId, "coast");
      assert.equal(transferred.region, "The Golden Coast");
      assert.deepEqual(transferred.entries, city.entries);
      assert.equal(transferred.x, city.x);
      assert.deepEqual(
        (await db.doc(`characters/${p.user.uid}`).get()).data(),
        before,
      );
    },
  );
  await check(
    "kingdom deletion preserves settlements previously transferred away",
    async () => {
      const current = (await db.doc("worlds/main").get()).data();
      const world = await admin.call("publishWorld", {
        world: removeKingdom(current, "reach"),
      });
      assert(world.locations.some((l) => l.id === "emberfall"));
      assert(!world.locations.some((l) => l.id === "thornwatch"));
      assert(!world.territories.some((k) => k.id === "reach"));
    },
  );
  await check(
    "deleting a settlement clears origin and internal references without moving characters",
    async () => {
      const current = (await db.doc("worlds/main").get()).data();
      const ref = db.doc(`characters/${p.user.uid}`);
      await ref.update({
        currentLocationId: "emberfall",
        internalLocationId: "copper-stag",
      });
      const before = (await ref.get()).data();
      const world = await admin.call("publishWorld", {
        world: {
          ...current,
          locations: current.locations.filter((l) => l.id !== "emberfall"),
        },
      });
      const after = (await ref.get()).data();
      assert.deepEqual(after, {
        ...before,
        originLocationId: null,
        currentLocationId: null,
        internalLocationId: null,
      });
      assert(
        !world.locations.some((l) =>
          l.entries.some((e) => e.id === "copper-stag"),
        ),
      );
    },
  );
  await check(
    "deleting the final kingdom is allowed and later grid changes preserve orphaned character positions",
    async () => {
      const current = (await db.doc("worlds/main").get()).data();
      const before = (await db.doc(`characters/${p.user.uid}`).get()).data();
      const empty = await admin.call("publishWorld", {
        world: removeKingdom(current, "coast"),
      });
      assert.equal(empty.locations.length, 0);
      assert.equal(empty.territories.length, 0);
      await admin.call("publishWorld", {
        world: { ...empty, radius: 50, offsetX: 5 },
      });
      assert.deepEqual(
        (await db.doc(`characters/${p.user.uid}`).get()).data(),
        before,
      );
    },
  );
  await check("old-version world publishing is rejected", async () => {
    await assert.rejects(
      admin.call("publishWorld", { world: DEFAULT_WORLD }),
      (e) => e.code === "functions/failed-precondition",
    );
  });
  await check(
    "invitation generation and role documents cannot be accessed by ordinary players",
    async () => {
      await assert.rejects(
        player.call("generateAdminInvitation", {}),
        (e) => e.code === "functions/permission-denied",
      );
      await assert.rejects(
        setDoc(doc(player.store, `adminRoles/${p.user.uid}`), {
          role: "admin",
        }),
        (e) => e.code === "permission-denied",
      );
      await assert.rejects(
        getDoc(doc(player.store, "adminInvitations/unknown")),
        (e) => e.code === "permission-denied",
      );
      const anonymous = client("anonymous");
      await assert.rejects(
        getDoc(doc(anonymous.store, `characters/${p.user.uid}`)),
        (e) => e.code === "permission-denied",
      );
      await assert.rejects(
        anonymous.call("redeemAdminInvitation", {
          key: `MSA-${"a".repeat(43)}`,
        }),
        (e) => e.code === "functions/unauthenticated",
      );
    },
  );
  const invitation = await admin.call("generateAdminInvitation", {});
  await check(
    "generated invitations store hashes only and expire after 24 hours",
    async () => {
      assert.match(invitation.key, /^MSA-[A-Za-z0-9_-]{43}$/);
      const stored = (
        await db.doc(`adminInvitations/${invitation.id}`).get()
      ).data();
      assert.equal(stored.expiresAt - stored.createdAt, 86400000);
      assert(!JSON.stringify(stored).includes(invitation.key));
      assert.equal(
        invitation.id,
        createHash("sha256").update(invitation.key).digest("hex"),
      );
    },
  );
  await check(
    "any signed-in key holder can activate admin access without changing token claims",
    async () => {
      await other.call("redeemAdminInvitation", { key: invitation.key });
      await other.call("redeemAdminInvitation", { key: invitation.key }); // safe network retry by the same account
      const claims = await other.auth.currentUser.getIdTokenResult();
      assert.notEqual(claims.claims.admin, true);
      assert.equal(
        (
          await getDoc(
            doc(other.store, `adminRoles/${other.auth.currentUser.uid}`),
          )
        ).data().role,
        "admin",
      );
      assert.equal(
        (await getDoc(doc(other.store, `characters/${p.user.uid}`))).data()
          .realName,
        "Private Player Name",
      );
      assert.match(
        (await other.call("generateAdminInvitation", {})).key,
        /^MSA-/,
      );
      await assert.rejects(
        player.call("redeemAdminInvitation", { key: invitation.key }),
        (e) => e.code === "functions/failed-precondition",
      );
    },
  );
  await check(
    "concurrent redemption grants an invitation to exactly one account",
    async () => {
      const first = client("race-first"),
        second = client("race-second");
      await createUserWithEmailAndPassword(
        first.auth,
        `first${salt}@example.com`,
        "test-password-123",
      );
      await createUserWithEmailAndPassword(
        second.auth,
        `second${salt}@example.com`,
        "test-password-123",
      );
      const invite = await admin.call("generateAdminInvitation", {});
      const results = await Promise.allSettled([
        first.call("redeemAdminInvitation", { key: invite.key }),
        second.call("redeemAdminInvitation", { key: invite.key }),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        (
          await Promise.all(
            [first, second].map((c) =>
              db.doc(`adminRoles/${c.auth.currentUser.uid}`).get(),
            ),
          )
        ).filter((s) => s.exists).length,
        1,
      );
    },
  );
  await check("revoked and expired keys cannot grant access", async () => {
    const revoked = await admin.call("generateAdminInvitation", {});
    await admin.call("revokeAdminInvitation", { id: revoked.id });
    await assert.rejects(
      player.call("redeemAdminInvitation", { key: revoked.key }),
      (e) => e.code === "functions/failed-precondition",
    );
    const expired = await admin.call("generateAdminInvitation", {});
    await db
      .doc(`adminInvitations/${expired.id}`)
      .update({ expiresAt: Date.now() - 1000 });
    await assert.rejects(
      player.call("redeemAdminInvitation", { key: expired.key }),
      (e) => e.code === "functions/failed-precondition",
    );
    assert(!(await db.doc(`adminRoles/${p.user.uid}`).get()).exists);
  });
  await check(
    "invitation generation is limited and even admins cannot write role documents directly",
    async () => {
      await admin.call("generateAdminInvitation", {});
      await assert.rejects(
        admin.call("generateAdminInvitation", {}),
        (e) => e.code === "functions/resource-exhausted",
      );
      await assert.rejects(
        setDoc(doc(admin.store, `adminRoles/${p.user.uid}`), { role: "admin" }),
        (e) => e.code === "permission-denied",
      );
    },
  );
  await check(
    "failed activation attempts are counted and limited",
    async () => {
      await db.doc(`invitationRedemptionLimits/${p.user.uid}`).delete();
      for (let i = 0; i < 10; i++)
        await assert.rejects(
          player.call("redeemAdminInvitation", {
            key: `MSA-${randomBytes(32).toString("base64url")}`,
          }),
          (e) => e.code === "functions/failed-precondition",
        );
      await assert.rejects(
        player.call("redeemAdminInvitation", {
          key: `MSA-${randomBytes(32).toString("base64url")}`,
        }),
        (e) => e.code === "functions/resource-exhausted",
      );
      assert.equal(
        (await db.doc(`invitationRedemptionLimits/${p.user.uid}`).get()).data()
          .count,
        10,
      );
    },
  );
  await check(
    "recreation requires confirmation of the current generation and keeps the old character on failure",
    async () => {
      const current = (await db.doc("worlds/main").get()).data();
      await admin.call("publishWorld", {
        world: { ...DEFAULT_WORLD, version: current.version },
      });
      const before = (await db.doc(`characters/${p.user.uid}`).get()).data();
      await assert.rejects(
        player.call("createCharacter", {
          name: "New Rowan",
          title: "",
          bio: "",
          realName: "Private New Name",
          portrait: "",
          locationId: "emberfall",
          replace: true,
          expectedGeneration: "outdated",
          requestId: crypto.randomUUID(),
        }),
        (e) => e.code === "functions/failed-precondition",
      );
      assert.deepEqual(
        (await db.doc(`characters/${p.user.uid}`).get()).data(),
        before,
      );
      await assert.rejects(
        player.call("createCharacter", {
          name: "New Rowan",
          realName: "",
          locationId: "emberfall",
          requestId: crypto.randomUUID(),
        }),
        (e) => e.code === "functions/invalid-argument",
      );
    },
  );
  await check(
    "confirmed recreation is idempotent, starts at home, and separates old journeys",
    async () => {
      const before = (await db.doc(`characters/${p.user.uid}`).get()).data();
      const data = {
        name: "New Rowan",
        title: "Keeper",
        bio: "A new story",
        realName: "Private New Name",
        portrait: "",
        locationId: "emberfall",
        replace: true,
        expectedGeneration: generation,
        requestId: crypto.randomUUID(),
      };
      const results = await Promise.all([
        player.call("createCharacter", data),
        player.call("createCharacter", data),
      ]);
      assert.equal(results[0].incarnationId, data.requestId);
      assert.deepEqual(results[0], results[1]);
      assert.equal(results[0].energy, 100);
      assert.deepEqual(
        (await db.doc(`characters/${p.user.uid}`).get()).data(),
        before,
        "Pending replacement must preserve the active character",
      );
      await admin.call("reviewCharacter", {
        uid: p.user.uid,
        applicationId: data.requestId,
        decision: "approved",
      });
      assert.equal(results[0].currentLocationId, "emberfall");
      assert.deepEqual(
        { x: results[0].x, y: results[0].y },
        center(hexAt(DEFAULT_WORLD.locations[0], DEFAULT_WORLD), DEFAULT_WORLD),
      );
      assert.deepEqual(
        (
          await db
            .doc(`characters/${p.user.uid}/incarnations/${generation}`)
            .get()
        ).data(),
        before,
      );
      assert.equal(
        (
          await db
            .collection(
              `characters/${p.user.uid}/incarnations/${generation}/journeys`,
            )
            .get()
        ).size,
        1,
      );
      assert.equal(
        (
          await db
            .collection(
              `characters/${p.user.uid}/incarnations/${data.requestId}/journeys`,
            )
            .get()
        ).size,
        0,
      );
      const currentWorld = (await db.doc("worlds/main").get()).data();
      await assert.rejects(
        player.call("travel", {
          destination,
          worldVersion: currentWorld.version,
          generation,
          requestId: crypto.randomUUID(),
        }),
        (e) => e.code === "functions/failed-precondition",
      );
      generation = data.requestId;
      await assert.rejects(
        player.call("createCharacter", {
          ...data,
          requestId: before.incarnationId,
          expectedGeneration: generation,
        }),
        (e) => e.code === "functions/failed-precondition",
      );
      const stranger = client("stranger-after-recreation");
      await createUserWithEmailAndPassword(
        stranger.auth,
        `stranger${salt}@example.com`,
        "test-password-123",
      );
      await assert.rejects(
        getDoc(doc(stranger.store, `characters/${p.user.uid}`)),
        (e) => e.code === "permission-denied",
      );
      await assert.rejects(
        getDoc(
          doc(
            stranger.store,
            `characters/${p.user.uid}/incarnations/${before.incarnationId}`,
          ),
        ),
        (e) => e.code === "permission-denied",
      );
    },
  );
  await check(
    "backend road travel discounts terrain, preserves river cost and rounds once",
    async () => {
      const current = (await db.doc("worlds/main").get()).data();
      const c = (await db.doc(`characters/${p.user.uid}`).get()).data();
      const start = hexAt(c, current),
        one = { q: start.q + 1, r: start.r },
        two = { q: start.q + 2, r: start.r };
      const tiles = {};
      for (const h of allHexes(current))
        tiles[key(h)] = { terrain: "water", river: false };
      tiles[key(start)] = { terrain: "plains", river: false };
      tiles[key(one)] = { terrain: "mountain", river: false, road: true };
      tiles[key(two)] = { terrain: "mountain", river: true, road: true };
      const world = await admin.call("publishWorld", {
        world: {
          ...current,
          tiles,
          locations: current.locations.map((l) => ({
            ...l,
            starting: l.id === "emberfall",
          })),
        },
      });
      const result = await player.call("travel", {
        destination: center(two, world),
        worldVersion: world.version,
        generation,
        cost: 0,
        requestId: crypto.randomUUID(),
      });
      assert.equal(result.journey.cost, 10);
      assert.equal(result.character.energy, 90);
    },
  );

  const { testWorldUpdate } = await import("./test-world-update.mjs");
  await testWorldUpdate({
    check,
    client,
    createUserWithEmailAndPassword,
    admin,
    db,
  });
  const { testLargeMaps } = await import("./test-large-maps.mjs");
  await testLargeMaps({ check, admin, player, other, db });
  console.log(`Firebase integration: ${passed} checks passed.`);
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
}
