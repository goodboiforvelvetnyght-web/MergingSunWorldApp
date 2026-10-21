import assert from "node:assert/strict";
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
    call: (n, data) => httpsCallable(functions, n)(data).then((r) => r.data),
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
      });
      assert.equal(c.originLocationId, "emberfall");
      assert.equal(c.energy, 100);
      await assert.rejects(
        player.call("createCharacter", {
          name: "Duplicate",
          title: "",
          bio: "",
          locationId: "emberfall",
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
        (await db.collection(`characters/${p.user.uid}/journeys`).get()).size,
        1,
      );
    },
  );
  await check("stale-world travel is rejected", async () => {
    await assert.rejects(
      player.call("travel", {
        destination: { x: 1090, y: 945 },
        worldVersion: 99,
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
  await check("publishing refuses deletion of a character origin", async () => {
    const current = (await db.doc("worlds/main").get()).data();
    await assert.rejects(
      admin.call("publishWorld", {
        world: {
          ...current,
          locations: current.locations.filter((l) => l.id !== "emberfall"),
        },
      }),
      (e) => e.code === "functions/failed-precondition",
    );
  });
  await check("old-version world publishing is rejected", async () => {
    await assert.rejects(
      admin.call("publishWorld", { world: DEFAULT_WORLD }),
      (e) => e.code === "functions/failed-precondition",
    );
  });
  console.log(`Firebase integration: ${passed} checks passed.`);
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
}
