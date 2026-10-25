import { test, expect } from "@playwright/test";
const coverId = "12345678-1234-1234-1234-123456789012";
async function fixture(page: import("@playwright/test").Page) {
  await page.route("**/o/public%2Fcovers%2F**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="200" fill="gold"/><rect y="200" width="600" height="200" fill="green"/></svg>',
    }),
  );
  await page.goto("/");
  await page.evaluate((id) => {
    const w = JSON.parse(localStorage.getItem("ms:world:v1")!);
    w.locations = w.locations.map((l: any) =>
      l.id === "emberfall"
        ? { ...l, coverAssetId: id, coverPosition: 25 }
        : l.id === "hollow"
          ? { ...l, kingdomId: null }
          : l,
    );
    localStorage.setItem("ms:world:v1", JSON.stringify(w));
  }, coverId);
  await page.reload();
}
test("Atlas and Lore browse by kingdom, search globally and hide independent places", async ({
  page,
}) => {
  await fixture(page);
  await expect(page.locator(".browse-kingdom-card")).toHaveCount(2);
  await expect(page.locator(".place-item")).toHaveCount(0);
  await page
    .getByRole("button", { name: "The Sunward Reach 4 places", exact: true })
    .click();
  await expect(page.locator(".place-item")).toHaveCount(4);
  await page.getByLabel("Search locations", { exact: true }).fill("Sunspire");
  await expect(page.locator(".place-item")).toHaveCount(1);
  await page.getByLabel("Search locations", { exact: true }).fill("Hollow");
  await expect(page.locator(".place-item")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Browse all places", exact: true })
    .click();
  await expect(page.locator(".place-item")).toHaveCount(5);
  await page.getByRole("button", { name: "Lore library", exact: true }).click();
  await page.getByRole("button", { name: "Kingdoms", exact: true }).click();
  await page
    .getByRole("button", { name: "The Sunward Reach 4 places", exact: true })
    .click();
  await expect(page.locator(".browse-kingdom-intro")).toContainText(
    "A realm of old roads",
  );
  await page
    .locator(".browse-entries")
    .getByRole("button", { name: "The Copper Stag", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "always room for another story",
  );
});
test("covers crop consistently in place panels and city pages; edits save, recover and remove", async ({
  page,
}) => {
  await fixture(page);
  await page.getByLabel("Search locations", { exact: true }).fill("Emberfall");
  await page.locator(".place-item").click();
  await expect(page.getByAltText("Emberfall cover")).toHaveCSS(
    "object-position",
    "50% 25%",
  );
  await page.getByRole("button", { name: "View city", exact: true }).click();
  await expect(page.locator(".city-cover-banner img")).toHaveCSS(
    "object-position",
    "50% 25%",
  );
  await page.getByRole("button", { name: "World editor", exact: true }).click();
  await page
    .locator(".kingdom-card")
    .filter({ hasText: "The Sunward Reach" })
    .click();
  await page.locator(".kingdom-card").filter({ hasText: "Emberfall" }).click();
  await page
    .getByRole("button", { name: "Edit settlement / allegiance" })
    .click();
  await expect(page.getByLabel("Upload settlement cover")).toBeDisabled();
  await page.getByLabel("Cover focal point", { exact: true }).fill("75");
  await expect(page.locator(".cover-edit-preview img")).toHaveCSS(
    "object-position",
    "50% 75%",
  );
  await page.getByRole("button", { name: "Save to world draft" }).click();
  await page.getByRole("button", { name: "Save local world" }).click();
  await page.reload();
  await page.getByLabel("Search locations", { exact: true }).fill("Emberfall");
  await page.locator(".place-item").click();
  await expect(page.getByAltText("Emberfall cover")).toHaveCSS(
    "object-position",
    "50% 75%",
  );
  await page.getByRole("button", { name: "World editor", exact: true }).click();
  await page
    .locator(".kingdom-card")
    .filter({ hasText: "The Sunward Reach" })
    .click();
  await page.locator(".kingdom-card").filter({ hasText: "Emberfall" }).click();
  await page
    .getByRole("button", { name: "Edit settlement / allegiance" })
    .click();
  await page.getByRole("button", { name: "Remove cover", exact: true }).click();
  await expect(page.locator(".cover-edit-preview img")).toHaveCount(0);
  await page.getByRole("button", { name: "Save to world draft" }).click();
  await page.getByRole("button", { name: "Save local world" }).click();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("ms:world:v1")!).locations.find(
          (l: any) => l.id === "emberfall",
        ).coverAssetId,
    ),
  ).toBeNull();
});
