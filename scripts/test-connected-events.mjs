import { readFile } from "node:fs/promises";
import { getStorage } from "../functions/node_modules/firebase-admin/lib/storage/index.js";
import { expect } from "@playwright/test";
export async function testConnectedEvents({ page, guest, db }) {
  page.setDefaultTimeout(15000);
  guest.setDefaultTimeout(15000);
  await guest.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Events", exact: true }).click();
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("The divided dawn");
  await page
    .getByLabel("Date and time", { exact: true })
    .fill("2026-11-14 14:00 Bangkok");
  await page
    .getByLabel("Story", { exact: true })
    .fill("Two banners gather on the plain.");
  await page.getByLabel("Published", { exact: true }).check();
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "The divided dawn", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Manage event", exact: true }).click();
  await page
    .getByRole("button", { name: "Add participant", exact: true })
    .click();
  await page
    .getByLabel("Character name", { exact: true })
    .fill("Registered Mira");
  await page
    .getByLabel("Public player identity", { exact: true })
    .fill("Mira player");
  await page.getByLabel("Class", { exact: true }).fill("Ranger");
  await page
    .getByRole("button", { name: "Save participant", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Registered Mira", exact: true }),
  ).toBeVisible();
  await guest.getByRole("button", { name: "Events", exact: true }).click();
  await guest.getByRole("button", { name: /The divided dawn/ }).click();
  await guest
    .getByRole("button", { name: "Link my character", exact: true })
    .click();
  await guest
    .getByRole("dialog")
    .getByRole("button", { name: /Registered Mira/ })
    .click();
  await expect(guest.getByRole("dialog")).toContainText(
    "regardless of their map position",
  );
  await guest
    .getByRole("button", { name: "Agree and request link", exact: true })
    .click();
  await expect(
    guest.getByRole("button", { name: "Link pending", exact: true }),
  ).toBeVisible();
  // Admin refreshes the event to fetch pending requests.
  await page.getByRole("button", { name: "All events", exact: true }).click();
  await page.getByRole("button", { name: /The divided dawn/ }).click();
  await page.getByRole("button", { name: "Manage event", exact: true }).click();
  await page.getByRole("button", { name: "Approve link", exact: true }).click();
  await expect(
    guest.getByRole("button", { name: "Registered Mira", exact: true }),
  ).toBeEnabled();
  await guest
    .getByRole("button", { name: "Registered Mira", exact: true })
    .click();
  await expect(guest.getByRole("dialog")).toContainText("Connected Mira");
  await expect(guest.getByRole("dialog")).not.toContainText(
    "Private Connected Player",
  );
  await guest
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await guest.setViewportSize({ width: 390, height: 844 });
  await expect(guest.locator(".event-sides")).toHaveCSS(
    "grid-template-columns",
    /^[0-9.]+px$/,
  );
  await guest.screenshot({ path: "/tmp/events-mobile.png", fullPage: true });
  const events = await db
    .collection("events")
    .where("title", "==", "The divided dawn")
    .get();
  const eventId = events.docs[0].id;
  // Exercise the frosted panels over real image assets in the emulator only.
  const artId = crypto.randomUUID(),
    logoId = crypto.randomUUID();
  const bucket = getStorage().bucket("demo-merging-sun.appspot.com");
  await bucket
    .file(`public/covers/${artId}/image.webp`)
    .save(await readFile("public/brand/background-small.webp"), {
      contentType: "image/webp",
    });
  await bucket
    .file(`public/emblems/${logoId}/image.webp`)
    .save(await readFile("public/brand/merging-sun-logo.png"), {
      contentType: "image/png",
    });
  await db.doc(`events/${eventId}`).update({
    sides: events.docs[0]
      .data()
      .sides.map((s) => ({ ...s, artwork: artId, logo: logoId })),
  });
  const context = await page.context().browser().newContext();
  const visitor = await context.newPage();
  visitor.setDefaultTimeout(15000);
  const url = new URL(`/events/${eventId}`, page.url()).href;
  await visitor.goto(url);
  await expect(
    visitor.getByRole("heading", { name: "The divided dawn", exact: true }),
  ).toBeVisible();
  await expect(
    visitor.getByRole("button", { name: "Manage event", exact: true }),
  ).toHaveCount(0);
  await expect(visitor.locator(".rail")).toHaveCount(0);
  await visitor
    .getByRole("button", { name: "Registered Mira", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    visitor.getByRole("button", { name: "Registered Mira", exact: true }),
  ).toBeEnabled();
  await visitor
    .getByRole("button", { name: "Registered Mira", exact: true })
    .click();
  await expect(visitor.getByRole("dialog")).toContainText("Connected Mira");
  await expect(visitor.getByRole("dialog")).not.toContainText(
    "Private Connected Player",
  );
  await visitor
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await visitor
    .getByRole("button", { name: "Link my character", exact: true })
    .click();
  await visitor
    .getByRole("button", { name: "Sign in to link", exact: true })
    .click();
  await expect(visitor.getByLabel("Email address")).toBeVisible();
  await visitor
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await visitor.reload();
  await expect(
    visitor.getByRole("heading", { name: "The divided dawn", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      visitor
        .locator(".event-side-logo")
        .first()
        .evaluate((img) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await visitor.screenshot({
    path: "/tmp/public-event-desktop.png",
    fullPage: true,
  });
  await visitor.setViewportSize({ width: 390, height: 844 });
  await expect(visitor.locator(".event-sides")).toHaveCSS(
    "grid-template-columns",
    /^[0-9.]+px$/,
  );
  await visitor.screenshot({
    path: "/tmp/public-event-mobile.png",
    fullPage: true,
  });
  await db.doc(`events/${eventId}`).update({ published: false });
  await expect(
    visitor.getByRole("heading", { name: "Event unavailable", exact: true }),
  ).toBeVisible();
  await expect(
    visitor.getByText("Registered Mira", { exact: true }),
  ).toHaveCount(0);
  await visitor.goto(new URL("/events/missing-event", page.url()).href);
  await expect(
    visitor.getByRole("heading", { name: "Event unavailable", exact: true }),
  ).toBeVisible();
  await context.close();
  console.log(
    "PASS public event deep links, anonymous profiles, sign-in on demand, reloads, private drafts and mobile presentation",
  );
  console.log(
    "PASS major event publishing, registration, link approval, public profile and mobile sides",
  );
}
