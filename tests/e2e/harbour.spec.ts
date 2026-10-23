import { test, expect } from "@playwright/test";
test("admin can add a harbour and configure its flat sailing cost", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "World editor", exact: true }).click();
  await page
    .locator(".kingdom-card")
    .filter({ hasText: "The Sunward Reach" })
    .click();
  await page.locator(".kingdom-card").filter({ hasText: "Emberfall" }).click();
  await page
    .getByRole("button", { name: "Edit settlement / allegiance" })
    .click();
  await page.getByLabel("Has harbour", { exact: true }).check();
  await page.getByRole("button", { name: "Save to world draft" }).click();
  await page.getByRole("button", { name: "World Rules", exact: true }).click();
  await page.getByLabel("Sailing energy cost", { exact: true }).fill("0");
  await expect(page.getByRole("alert")).toContainText("Sailing cost");
  await page.getByLabel("Sailing energy cost", { exact: true }).fill("7");
  await page.getByRole("button", { name: "Save local world" }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ms:world:v1")!),
  );
  expect(saved.locations.find((l: any) => l.id === "emberfall").harbour).toBe(
    true,
  );
  expect(saved.travelRules.sailingCost).toBe(7);
});
test("sailing requires city entry, previews lore, confirms cost and arrives inside destination", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    const w = JSON.parse(localStorage.getItem("ms:world:v1")!);
    w.travelRules.sailingCost = 7;
    w.locations = w.locations.map((l: any) => ({
      ...l,
      harbour: ["emberfall", "sunspire"].includes(l.id),
    }));
    localStorage.setItem("ms:world:v1", JSON.stringify(w));
  });
  await page.reload();
  await page
    .getByRole("textbox", { name: "Search locations" })
    .fill("Emberfall");
  await page.locator(".place-item").click();
  await page.getByRole("button", { name: "Enter city", exact: true }).click();
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ms:character:v1")!),
  );
  await page
    .getByLabel("Destination harbour", { exact: true })
    .selectOption("sunspire");
  await page.getByText("Read about Sunspire", { exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Harbour", exact: true }),
  ).toContainText("Sunspire");
  await page
    .getByRole("button", { name: "Sail to Sunspire", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("ms:character:v1")!).energy,
    ),
  ).toBe(before.energy);
  await page
    .getByRole("button", { name: "Confirm sailing", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Sunspire city view", exact: true }),
  ).toContainText("Inside Sunspire");
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ms:character:v1")!),
  );
  expect(after.energy).toBe(before.energy - 7);
  expect(after.currentLocationId).toBe("sunspire");
  expect(after.internalLocationId).toBeNull();
  await page.getByRole("button", { name: "Back to map", exact: true }).click();
  await page.reload();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("ms:character:v1")!).currentLocationId,
    ),
  ).toBe("sunspire");
});
