// Isolated connected browser tests. The Firebase CLI supplies demo emulator endpoints.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bootstrapInvitation } from "../functions/lib/functions/src/bootstrap.js";
import { randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { chromium, expect } from "@playwright/test";
import { initializeApp } from "../functions/node_modules/firebase-admin/lib/app/index.js";
import { getAuth } from "../functions/node_modules/firebase-admin/lib/auth/index.js";
import { getFirestore } from "../functions/node_modules/firebase-admin/lib/firestore/index.js";
initializeApp({ projectId: "demo-merging-sun" });
const auth = getAuth(),
  db = getFirestore(),
  port = 5175;
const vite = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  { env: { ...process.env, VITE_FIREBASE_EMULATORS: "true" }, stdio: "ignore" },
);
let browser;
async function signIn(page, email) {
  await page.goto(`http://127.0.0.1:${port}/admin/activate`);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(
    page.getByLabel("Activation key", { exact: true }),
  ).toBeVisible();
}
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  const salt = Date.now();
  const bootstrapKeyFile = process.env.BOOTSTRAP_TEST_KEY_FILE;
  const owner = await auth.createUser({
    ...(bootstrapKeyFile ? { uid: bootstrapInvitation.uid } : {}),
    email: `owner${salt}@example.com`,
    password: "test-password-123",
  });
  const invited = await auth.createUser({
    email: `invited${salt}@example.com`,
    password: "test-password-123",
  });
  const seedKey = bootstrapKeyFile
      ? (await readFile(bootstrapKeyFile, "utf8")).trim()
      : `MSA-${randomBytes(32).toString("base64url")}`,
    hash = createHash("sha256").update(seedKey).digest("hex");
  if (bootstrapKeyFile) assert.equal(hash, bootstrapInvitation.hash);
  else
    await db.doc(`adminInvitations/${hash}`).set({
      createdBy: "test-bootstrap",
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000,
      usedBy: null,
      usedAt: null,
      revokedAt: null,
    });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  if (bootstrapKeyFile) {
    const wrong = await browser.newContext(),
      wrongPage = await wrong.newPage();
    await signIn(wrongPage, invited.email);
    await wrongPage.getByLabel("Activation key", { exact: true }).fill(seedKey);
    await wrongPage
      .getByRole("button", { name: "Activate admin access", exact: true })
      .click();
    await expect(wrongPage.getByRole("alert")).toContainText(
      "invalid, expired, revoked, or already used",
    );
    assert(!(await db.doc(`adminRoles/${invited.uid}`).get()).exists);
    await wrong.close();
    console.log("PASS initial bootstrap key rejects a different account");
  }
  const first = await browser.newContext(),
    page = await first.newPage();
  await signIn(page, owner.email);
  await page.getByLabel("Activation key", { exact: true }).fill(seedKey);
  await page
    .getByRole("button", { name: "Activate admin access", exact: true })
    .click();
  await expect(
    page.getByText("Your account has admin access.", { exact: true }),
  ).toBeVisible();
  assert.equal(
    (await db.doc(`adminRoles/${owner.uid}`).get()).data().role,
    "admin",
  );
  await page
    .getByRole("link", { name: "Enter the world", exact: true })
    .click();
  await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
  await page.getByRole("button", { name: "Got it", exact: true }).click();
  await page.getByRole("button", { name: "World editor", exact: true }).click();
  await page
    .locator("summary")
    .filter({ hasText: "Admin invitations" })
    .click();
  await page
    .getByRole("button", { name: "Generate admin invitation", exact: true })
    .click();
  await expect(page.locator(".issued-invitation code")).toHaveText(
    /^MSA-[A-Za-z0-9_-]{43}$/,
  );
  const invitation = await page.locator(".issued-invitation code").innerText();
  console.log(
    "PASS activation updates admin UI and can generate an invitation",
  );
  const second = await browser.newContext(),
    guest = await second.newPage();
  await signIn(guest, invited.email);
  await guest.getByLabel("Activation key", { exact: true }).fill(invitation);
  await guest
    .getByRole("button", { name: "Activate admin access", exact: true })
    .click();
  await expect(
    guest.getByText("Your account has admin access.", { exact: true }),
  ).toBeVisible();
  assert.equal(
    (await db.doc(`adminRoles/${invited.uid}`).get()).data().role,
    "admin",
  );
  console.log("PASS another signed-in account can redeem the generated key");
  await guest
    .getByRole("link", { name: "Enter the world", exact: true })
    .click();
  await guest.getByRole("button", { name: "Sign out", exact: true }).waitFor();
  await guest.getByRole("button", { name: "Got it", exact: true }).click();
  await guest
    .getByRole("button", { name: "My character", exact: true })
    .click();
  await guest
    .getByRole("button", { name: "Create character", exact: true })
    .click();
  await guest
    .getByLabel("Character name", { exact: true })
    .fill("Connected Mira");
  await guest.getByRole("button", { name: "Continue", exact: true }).click();
  await guest
    .getByRole("button", { name: "The Sunward Reach", exact: true })
    .click();
  await guest.getByRole("button", { name: "Continue", exact: true }).click();
  await guest
    .getByRole("button", { name: /Emberfall Available birthplace/ })
    .click();
  await guest.getByRole("button", { name: "Continue", exact: true }).click();
  await guest
    .getByLabel("Backstory", { exact: true })
    .fill("Born among the old roads.");
  await guest.getByRole("button", { name: "Continue", exact: true }).click();
  await guest
    .getByRole("button", { name: "Skip for now", exact: true })
    .click();
  await guest
    .getByLabel("Your real name", { exact: true })
    .fill("Private Connected Player");
  await guest.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(guest.getByRole("checkbox")).toHaveCount(0);
  await guest
    .getByRole("button", { name: "Submit for review", exact: true })
    .click();
  await expect(
    guest.getByRole("heading", { name: "Awaiting admin review" }),
  ).toBeVisible();
  assert(!(await db.doc(`characters/${invited.uid}`).get()).exists);
  await page
    .locator("summary")
    .filter({ hasText: "Character reviews" })
    .click();
  await expect(
    page.getByRole("button", { name: "Approve Connected Mira", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reject with reason", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Rejection reason")
    .fill("Please describe your ties to Emberfall.");
  await page
    .getByRole("button", { name: "Reject with reason", exact: true })
    .click();
  await expect(
    guest.getByText("Please describe your ties to Emberfall.", { exact: true }),
  ).toBeVisible();
  // Seed an updated submission through the same public callable using the browser's authenticated SDK.
  await guest
    .getByRole("button", { name: "Edit and resubmit", exact: true })
    .click();
  await expect(guest.getByLabel("Character name", { exact: true })).toHaveValue(
    "Connected Mira",
  );
  await guest.getByRole("button", { name: "Continue", exact: true }).click();
  await guest.getByRole("button", { name: "Continue", exact: true }).click();
  await guest.getByRole("button", { name: "Continue", exact: true }).click();
  await guest
    .getByLabel("Backstory", { exact: true })
    .fill("My family keeps the old roads of Emberfall.");
  await guest.getByRole("button", { name: "Continue", exact: true }).click();
  await guest
    .getByRole("button", { name: "Skip for now", exact: true })
    .click();
  await guest.getByRole("button", { name: "Continue", exact: true }).click();
  await guest
    .getByRole("button", { name: "Submit for review", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Approve Connected Mira", exact: true })
    .click();
  await expect(guest.locator(".character-profile h2")).toHaveText(
    "Connected Mira",
  );
  const c = (await db.doc(`characters/${invited.uid}`).get()).data();
  assert.equal(c.realName, "Private Connected Player");
  assert.equal(c.originLocationId, "emberfall");
  await guest.reload();
  await guest
    .getByRole("button", { name: "My character", exact: true })
    .click();
  await expect(guest.locator(".character-profile h2")).toHaveText(
    "Connected Mira",
  );
  console.log(
    "PASS connected full-page creation and private real-name persistence",
  );
  const { testConnectedWorldUpdate } =
    await import("./test-connected-world-update.mjs");
  await testConnectedWorldUpdate({ page, guest, db, owner, invited });
  const { testConnectedEvents } = await import("./test-connected-events.mjs");
  await testConnectedEvents({ page, guest, db });
  console.log("Connected browser checks: 6 passed.");
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  vite.kill("SIGTERM");
}
