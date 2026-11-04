import { readFile } from "node:fs/promises";
import { expect } from "@playwright/test";
export async function testConnectedRegistration({ page, db }) {
  await page.getByRole("button", { name: "All events", exact: true }).click();
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("The gathering registration");
  await page
    .getByLabel("Date and time", { exact: true })
    .fill("2026-12-05 14:00 Bangkok");
  await page.getByLabel("Published", { exact: true }).check();
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  await page.getByRole("button", { name: "Manage event", exact: true }).click();
  await page
    .getByRole("button", { name: "Registration settings", exact: true })
    .click();
  await page.getByLabel("Registration open", { exact: true }).check();
  await page
    .getByRole("textbox", { name: "Event registration terms", exact: true })
    .fill("Respect the event rules. Payment is checked outside the app.");
  await page
    .getByRole("textbox", { name: "Side one costume guidance", exact: true })
    .fill("Wear red and gold.");
  const sideEditor = page
    .locator(".rich-editor")
    .filter({
      has: page.getByRole("textbox", {
        name: "Side one costume guidance",
        exact: true,
      }),
    });
  await sideEditor
    .locator("input[type=file]")
    .setInputFiles({
      name: "costume-example.webp",
      mimeType: "image/webp",
      buffer: await readFile("public/brand/background-small.webp"),
    });
  await expect(sideEditor.locator("img")).toBeVisible();
  await page
    .getByRole("button", { name: "Save form draft", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  await page
    .getByRole("button", { name: "Preview registration", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Click to begin", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close preview", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Publish registration settings", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("published");
  const docs = await db
    .collection("events")
    .where("title", "==", "The gathering registration")
    .get();
  const eventId = docs.docs[0].id;
  const context = await page
      .context()
      .browser()
      .newContext({ viewport: { width: 390, height: 844 } }),
    visitor = await context.newPage();
  visitor.setDefaultTimeout(15000);
  await visitor.goto(new URL(`/events/${eventId}/register`, page.url()).href);
  await visitor
    .getByRole("button", { name: "Click to begin", exact: true })
    .click();
  await visitor.getByRole("button", { name: "Side one", exact: true }).click();
  await expect(
    visitor.getByText("Wear red and gold.", { exact: true }),
  ).toBeVisible();
  await visitor
    .getByLabel(
      "I understand and will follow this side’s costume color requirements.",
    )
    .check();
  await visitor
    .getByRole("button", { name: "Continue to registration", exact: true })
    .click();
  await visitor
    .getByRole("textbox", { name: /Character name/ })
    .fill("New Visitor");
  await visitor
    .getByRole("textbox", { name: /Public player identity/ })
    .fill("Public Visitor");
  await visitor.getByRole("textbox", { name: /Class/ }).fill("Ranger");
  await visitor.getByRole("button", { name: "Next", exact: true }).click();
  await visitor
    .getByRole("textbox", { name: /Contact name/ })
    .fill("Private Visitor");
  await visitor
    .getByRole("textbox", { name: /Phone number/ })
    .fill("+66 123456789");
  await visitor
    .getByRole("button", { name: "Review registration", exact: true })
    .click();
  await expect(
    visitor.getByRole("heading", { name: "Review your request", exact: true }),
  ).toBeVisible();
  await visitor.getByLabel(/I accept the event terms/).check();
  await visitor
    .getByRole("button", { name: "Submit registration request", exact: true })
    .click();
  await expect(
    visitor.getByRole("heading", {
      name: "Registration received",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    visitor.getByText(/Your place is not reserved or confirmed/),
  ).toBeVisible();
  await visitor.screenshot({ path: "/tmp/registration-mobile-complete.png" });
  await page
    .getByRole("button", { name: "Registration requests", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "New Visitor", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review request", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByLabel("Contact name", { exact: true }),
  ).toHaveValue("Private Visitor");
  await page
    .getByRole("button", { name: "Confirm after payment", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("confirmed");
  await visitor.goto(new URL(`/events/${eventId}`, page.url()).href);
  await expect(
    visitor.getByRole("heading", { name: "New Visitor", exact: true }),
  ).toBeVisible();
  await expect(
    visitor.getByText("Private Visitor", { exact: true }),
  ).toHaveCount(0);
  await expect(visitor.getByText("+66 123456789", { exact: true })).toHaveCount(
    0,
  );
  await context.close();
  console.log(
    "PASS SurveyJS draft/preview/publish, anonymous mobile registration, rich guidance, private review and public roster confirmation",
  );
}
