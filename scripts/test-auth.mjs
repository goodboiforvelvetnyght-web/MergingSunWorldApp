import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium, expect } from "@playwright/test";
const vite = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "5174",
    "--strictPort",
  ],
  { env: { ...process.env, VITE_FIREBASE_EMULATORS: "true" }, stdio: "ignore" },
);
async function openAuth(page) {
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .last()
    .click();
}
async function popupAccount(page, email, verified = true) {
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Continue with Google", exact: true })
    .click();
  const popup = await popupPromise;
  await popup.locator("#add-account-button").click();
  await popup.locator("#email-input").fill(email);
  await popup.locator("#display-name-input").fill("Google Traveler");
  if (!verified) {
    // The emulator widget always issues verified identities. Model a collision
    // requiring password verification using an unverified provider response.
    await popup.evaluate(() => {
      const original = window.createFakeClaims;
      window.createFakeClaims = (info) => {
        const claims = JSON.parse(decodeURIComponent(original(info)));
        claims.email_verified = false;
        return encodeURIComponent(JSON.stringify(claims));
      };
    });
  }
  await popup.locator("#sign-in").click();
}
async function currentIdentity(page) {
  return page.evaluate(async () => {
    const { auth } = await import("/src/firebase.ts");
    return {
      uid: auth.currentUser?.uid,
      providers: auth.currentUser?.providerData.map((p) => p.providerId),
    };
  });
}
let browser;
try {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch("http://127.0.0.1:5174");
      if (res.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  // Cloud-workspace HTTPS interception is limited to this disposable test browser.
  const page = await browser.newPage({
    ignoreHTTPSErrors: !!process.env.HTTPS_PROXY,
  });
  page.setDefaultTimeout(30000);
  const account = `traveler${Date.now()}`,
    email = `${account}@example.com`;
  await page.goto("http://127.0.0.1:5174");
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
  assert((await page.locator(".user-label").innerText()).includes(account));
  const passwordIdentity = await currentIdentity(page);
  console.log("PASS Firebase sign-up through browser");
  await page.reload();
  await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
  console.log("PASS auth session persists across reload");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .last()
    .click();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
  console.log("PASS sign-out and sign-in through browser");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "If an account exists" })
    .waitFor();
  console.log("PASS password reset request");
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  const googleEmail = `google${Date.now()}@gmail.com`;
  await popupAccount(page, googleEmail);
  await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
  const googleIdentity = await currentIdentity(page);
  assert(googleIdentity.providers.includes("google.com"));
  await page.reload();
  await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
  assert.equal((await currentIdentity(page)).uid, googleIdentity.uid);
  console.log("PASS Google popup registration and session persistence");

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await openAuth(page);
  await popupAccount(page, email);
  await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
  assert.equal((await currentIdentity(page)).uid, passwordIdentity.uid);
  console.log("PASS Google sign-in keeps an existing same-email account UID");

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await openAuth(page);
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  const linkEmail = `link${Date.now()}@example.com`;
  await page.getByLabel("Email address").fill(linkEmail);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
  const linkIdentity = await currentIdentity(page);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await openAuth(page);
  await popupAccount(page, linkEmail, false);
  await expect(
    page.getByRole("status").filter({ hasText: "Enter its password" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveValue(linkEmail);
  await expect(page.getByLabel("Email address")).toBeDisabled();
  await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
  await page
    .getByRole("button", { name: "Sign in and connect Google", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("incorrect");
  assert.equal((await currentIdentity(page)).uid, undefined);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "Sign in and connect Google", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const linked = await currentIdentity(page);
  assert.equal(linked.uid, linkIdentity.uid);
  assert(
    linked.providers.includes("password") &&
      linked.providers.includes("google.com"),
  );
  console.log(
    "PASS conflicting Google identity links only after password verification without a new UID",
  );

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await openAuth(page);
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Continue with Google", exact: true })
    .click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  await popup.close();
  await expect(
    page.getByRole("button", { name: "Continue with Google", exact: true }),
  ).toBeEnabled({ timeout: 10000 });
  await expect(page.getByRole("alert")).toHaveCount(0);
  console.log(
    "PASS cancelled Google popup returns to an available sign-in form",
  );
  await page.evaluate(() => {
    window.open = () => null;
  });
  await page
    .getByRole("button", { name: "Continue with Google", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Allow pop-ups for this site",
  );
  await expect(
    page.getByRole("button", { name: "Continue with Google", exact: true }),
  ).toBeEnabled();
  console.log(
    "PASS blocked Google popup gives a retry message and keeps email sign-in available",
  );
  console.log("Firebase auth browser checks: 9 passed.");
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  vite.kill("SIGTERM");
}
