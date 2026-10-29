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
  console.log(
    "PASS major event publishing, registration, link approval, public profile and mobile sides",
  );
}
