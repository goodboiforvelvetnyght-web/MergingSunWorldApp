import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import {
  DEFAULT_WORLD,
  makeCharacter,
  commonsId,
} from "../functions/lib/shared/world.js";
export async function testConnectedWorldUpdate({
  page,
  guest,
  db,
  owner,
  invited,
}) {
  const bytes = await sharp({
    create: {
      width: 256,
      height: 160,
      channels: 4,
      background: { r: 140, g: 60, b: 30, alpha: 0.7 },
    },
  })
    .png()
    .toBuffer();
  const mapBytes = await sharp(randomBytes(3969 * 1814 * 3), {
    raw: { width: 3969, height: 1814, channels: 3 },
  })
    .blur(1)
    .jpeg({ quality: 88 })
    .toBuffer();
  // An existing approved resident is a fixture; all entering and inspection uses the real UI/backend.
  await db.doc(`characters/${owner.uid}`).set({
    ...makeCharacter(
      "Resident of the Commons",
      "Keeper",
      "A public resident history.",
      DEFAULT_WORLD.locations[0],
      DEFAULT_WORLD,
    ),
    incarnationId: crypto.randomUUID(),
    realName: "Hidden Resident Real Name",
    currentLocationId: "emberfall",
    internalLocationId: commonsId("emberfall"),
  });
  await page.getByRole("button", { name: "Landscape", exact: true }).click();
  await page
    .getByRole("button", { name: "Grid settings", exact: true })
    .click();
  await page.getByLabel("Grid offset X", { exact: true }).fill("1");
  await expect(
    page.getByRole("button", { name: "Publish world", exact: true }),
  ).toBeEnabled();
  // Both gateway timeouts and internal failures must allow a clean retry.
  for (const [status, message] of [
    [504, "Preparing this image took too long"],
    [500, "The image upload or processing did not finish"],
  ]) {
    let finishTimedOutUpload;
    const waitingUpload = new Promise((resolve) => {
      finishTimedOutUpload = resolve;
    });
    await page.route("**/processMapUpload", async (route) => {
      await waitingUpload;
      await route.fulfill({
        status,
        contentType: "text/plain",
        body: "Gateway timeout",
      });
    });
    await page.getByLabel("Upload map artwork", { exact: true }).setInputFiles({
      name: "world.jpg",
      mimeType: "image/jpeg",
      buffer: mapBytes,
    });
    await expect(page.getByText("Checking original image…")).toBeVisible();
    await expect(
      page.getByRole("progressbar", { name: "Map processing progress" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Publish world", exact: true }),
    ).toBeDisabled();
    finishTimedOutUpload();
    await expect(page.getByRole("alert")).toContainText(message);
    await expect(
      page.getByLabel("Upload map artwork", { exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Publish world", exact: true }),
    ).toBeEnabled();
    assert(!(await db.doc("worlds/main").get()).data()?.mapAssetId);
    await expect(page.getByLabel("Grid offset X", { exact: true })).toHaveValue(
      "1",
    );
    await page.unroute("**/processMapUpload");
  }
  await page
    .getByRole("button", { name: "Undo map edit", exact: true })
    .click();
  await expect(page.getByLabel("Grid offset X", { exact: true })).toHaveValue(
    "0",
  );
  await page.getByLabel("Upload map artwork", { exact: true }).setInputFiles({
    name: "world.jpg",
    mimeType: "image/jpeg",
    buffer: mapBytes,
  });
  await expect(
    page.getByRole("dialog", { name: "Align the world with this map" }),
  ).toBeVisible({ timeout: 60000 });
  await expect(
    page.locator(".map-alignment-preview .leaflet-tile-loaded").first(),
  )
    .toBeVisible({ timeout: 15000 })
    .catch(async (error) => {
      console.log(
        "Alignment diagnostics",
        await page
          .locator(".map-alignment-preview .map-canvas")
          .evaluate((el) => ({
            zoom: el.dataset.mapZoom,
            rect: el.getBoundingClientRect().toJSON(),
            tiles: [...el.querySelectorAll(".leaflet-tile")].map((img) => ({
              src: img.src,
              complete: img.complete,
              width: img.naturalWidth,
            })),
            html: el.innerHTML.slice(0, 1000),
          })),
      );
      await page.screenshot({ path: "/tmp/ms-alignment-failure.png" });
      throw error;
    });
  await expect
    .poll(async () =>
      Number(
        await page
          .locator(".map-alignment-preview .map-canvas")
          .getAttribute("data-map-zoom"),
      ),
    )
    .toBeLessThan(2);
  if (process.env.MAP_ALIGNMENT_SCREENSHOT)
    await page.screenshot({ path: process.env.MAP_ALIGNMENT_SCREENSHOT });
  await page
    .getByRole("button", { name: "Use this alignment in draft", exact: true })
    .click();
  await expect(page.getByAltText("Map artwork preview")).toBeVisible({
    timeout: 30000,
  });
  await expect
    .poll(() =>
      page
        .getByAltText("Map artwork preview")
        .evaluate((img) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(
    page.locator('.leaflet-tile-loaded[src*="127.0.0.1:9199"]').first(),
  ).toBeVisible();
  assert(
    !(await db.doc("worlds/main").get()).data()?.mapAssetId,
    "Upload must stay in the editor draft until published",
  );
  await page.getByRole("button", { name: "Places", exact: true }).click();
  await page
    .locator(".places-editor .kingdom-card")
    .filter({ hasText: "The Sunward Reach" })
    .click();
  await page
    .getByRole("button", { name: "Edit kingdom & border", exact: true })
    .click();
  await page
    .getByLabel("Upload coat of arms or flag", { exact: true })
    .setInputFiles({ name: "flag.png", mimeType: "image/png", buffer: bytes });
  await expect(page.getByAltText("Kingdom emblem preview")).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByAltText("Kingdom emblem preview")
        .evaluate((img) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.getByLabel("Emblem X", { exact: true }).fill("650");
  await page.getByLabel("Emblem Y", { exact: true }).fill("500");
  await page
    .getByRole("button", { name: "Save kingdom to draft", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Publish world", exact: true })
    .click();
  await expect
    .poll(async () => (await db.doc("worlds/main").get()).data()?.mapAssetId)
    .toBeTruthy();
  const world = (await db.doc("worlds/main").get()).data();
  assert(world.territories.find((k) => k.id === "reach").emblemAssetId);
  assert.deepEqual(
    world.territories.find((k) => k.id === "reach").emblemPosition,
    { x: 650, y: 500 },
  );
  await guest.getByRole("button", { name: "World atlas", exact: true }).click();
  await guest
    .getByRole("button", { name: "Fit entire world", exact: true })
    .click();
  await expect(
    guest.locator('.kingdom-map-emblem[title="The Sunward Reach"] img'),
  ).toBeVisible();
  await guest.locator('.kingdom-map-emblem[title="The Sunward Reach"]').click();
  await expect(guest.getByRole("dialog")).toContainText("A realm of old roads");
  await guest
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await guest.getByLabel("Search locations", { exact: true }).fill("Emberfall");
  await guest.locator(".place-item").click();
  await expect(
    guest.getByText("2 characters here · includes offline players", {
      exact: true,
    }),
  ).toBeVisible();
  await guest
    .locator(".internal-entries .kingdom-card")
    .filter({ hasText: "Town Commons" })
    .click();
  await expect(guest.getByRole("dialog")).toContainText("You are here");
  await guest
    .getByRole("button", {
      name: "Resident of the Commons Keeper",
      exact: true,
    })
    .click();
  await expect(guest.getByRole("dialog")).toContainText(
    "A public resident history.",
  );
  await expect(guest.getByRole("dialog")).not.toContainText(
    "Hidden Resident Real Name",
  );
  await guest
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await guest
    .locator(".internal-entries .kingdom-card")
    .filter({ hasText: "The Copper Stag" })
    .click();
  await guest
    .getByRole("button", { name: "Enter The Copper Stag", exact: true })
    .click();
  await expect(guest.getByRole("dialog")).toContainText(
    "No other characters here.",
  );
  assert.equal(
    (await db.doc(`characters/${invited.uid}`).get()).data().internalLocationId,
    "copper-stag",
  );
  await guest
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await guest.setViewportSize({ width: 390, height: 844 });
  await guest
    .locator(".internal-entries .kingdom-card")
    .filter({ hasText: "Town Commons" })
    .click();
  await guest
    .getByRole("button", { name: "Enter Town Commons", exact: true })
    .click();
  await expect(
    guest.getByRole("button", {
      name: "Resident of the Commons Keeper",
      exact: true,
    }),
  ).toBeVisible();
  console.log(
    "PASS draft map upload, published tiles and manually positioned kingdom emblem",
  );
  console.log(
    "PASS live population, private room profiles and internal-location entry on desktop and mobile",
  );
}
