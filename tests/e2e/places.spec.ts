import { test, expect } from "@playwright/test";

async function openPlaces(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "World editor", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Places", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
}

test("kingdom-first navigation, encyclopedia entries, allegiance and cascading deletion", async ({
  page,
}) => {
  await openPlaces(page);
  await expect(page.locator(".places-editor .kingdom-card")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Add river", exact: true }),
  ).toHaveCount(0);
  await page
    .locator(".kingdom-card")
    .filter({ hasText: "The Sunward Reach" })
    .click();
  await page.locator(".kingdom-card").filter({ hasText: "Emberfall" }).click();
  await page
    .getByRole("button", { name: "Add internal location", exact: true })
    .click();
  await page.getByLabel("Entry name", { exact: true }).fill("Moonlit Library");
  await page
    .getByRole("textbox", { name: "Location lore" })
    .fill("A library of forgotten histories.");
  await page.getByRole("button", { name: "Save entry to draft" }).click();
  await expect(
    page.locator(".kingdom-card").filter({ hasText: "Moonlit Library" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit settlement / allegiance" })
    .click();
  await page.getByLabel("Allegiance", { exact: true }).selectOption("coast");
  await page.getByRole("button", { name: "Save to world draft" }).click();
  await expect(
    page
      .locator(".places-editor .kingdom-card")
      .filter({ hasText: "Emberfall" }),
  ).toHaveCount(0);
  await page
    .getByRole("region", { name: "World hierarchy" })
    .getByRole("button", { name: "The Sunward Reach", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete kingdom", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("3 settlements");
  await expect(page.getByRole("dialog")).not.toContainText("Emberfall");
  await page
    .getByRole("button", { name: "Delete kingdom and contents", exact: true })
    .click();
  await page.getByRole("button", { name: "Save local world" }).click();
  await page.reload();
  await page
    .getByRole("textbox", { name: "Search locations" })
    .fill("Emberfall");
  await page.locator(".place-item").click();
  await page
    .locator(".internal-entries .kingdom-card")
    .filter({ hasText: "Moonlit Library" })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "A library of forgotten histories.",
  );
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ms:world:v1")!),
  );
  expect(saved.territories.some((k: any) => k.id === "reach")).toBe(false);
  expect(saved.locations.find((l: any) => l.id === "emberfall").kingdomId).toBe(
    "coast",
  );
});

test("deleting a character's kingdom preserves position and later grid changes keep it there", async ({
  page,
}) => {
  await openPlaces(page);
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ms:character:v1")!),
  );
  await page
    .locator(".kingdom-card")
    .filter({ hasText: "The Sunward Reach" })
    .click();
  await page
    .getByRole("button", { name: "Delete kingdom", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "4 settlements, and 1 internal locations",
  );
  await page
    .getByRole("button", { name: "Delete kingdom and contents", exact: true })
    .click();
  await page.getByRole("button", { name: "Save local world" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("ms:character:v1")!).originLocationId,
      ),
    )
    .toBeNull();
  await page.getByRole("button", { name: "Landscape", exact: true }).click();
  await page
    .getByRole("button", { name: "Grid settings", exact: true })
    .click();
  await page.getByRole("slider", { name: "Hex radius" }).fill("48");
  await page.getByRole("button", { name: "Save local world" }).click();
  await page
    .getByRole("button", { name: "Publish grid & return characters" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ms:character:v1")!),
  );
  expect(after).toEqual({ ...before, originLocationId: null });
});

test("create and edit a kingdom border, then add a settlement outside that border", async ({
  page,
}) => {
  await openPlaces(page);
  await page.getByRole("button", { name: "Add kingdom", exact: true }).click();
  await page.getByLabel("Kingdom name", { exact: true }).fill("Northmarch");
  await expect(
    page.getByRole("button", { name: "Save kingdom to draft" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Draw replacement border" }).click();
  const map = page.getByTestId("world-map");
  const box = (await map.boundingBox())!;
  for (const [x, y] of [
    [0.42, 0.3],
    [0.55, 0.3],
    [0.5, 0.42],
  ])
    await map.click({ position: { x: box.width * x, y: box.height * y } });
  await page.getByRole("button", { name: "Save kingdom to draft" }).click();
  await expect(
    page.getByRole("heading", { name: "Northmarch", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit kingdom & border" }).click();
  await page.getByText("Edit border coordinates", { exact: true }).click();
  await page.getByLabel("Point 1 X", { exact: true }).fill("120");
  await page.getByRole("button", { name: "Save kingdom to draft" }).click();
  await page
    .getByRole("button", { name: "Add settlement", exact: true })
    .click();
  await map.click({ position: { x: box.width * 0.6, y: box.height * 0.6 } });
  await page
    .getByLabel("Settlement name", { exact: true })
    .fill("Faraway Village");
  await page.getByLabel("Type", { exact: true }).selectOption("village");
  await page.getByLabel("Map X", { exact: true }).fill("1090");
  await page.getByLabel("Map Y", { exact: true }).fill("945");
  await page.getByRole("button", { name: "Save to world draft" }).click();
  await page.getByRole("button", { name: "Save local world" }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ms:world:v1")!),
  );
  const kingdom = saved.territories.find((k: any) => k.name === "Northmarch");
  expect(kingdom.points[0].x).toBe(120);
  expect(
    saved.locations.find((l: any) => l.name === "Faraway Village"),
  ).toMatchObject({ kingdomId: kingdom.id, kind: "village", x: 1090, y: 945 });
});

test("desktop hierarchy and editing an internal entry", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openPlaces(page);
  await page
    .locator(".kingdom-card")
    .filter({ hasText: "The Sunward Reach" })
    .click();
  await page.locator(".kingdom-card").filter({ hasText: "Emberfall" }).click();
  await page
    .locator(".kingdom-card")
    .filter({ hasText: "The Copper Stag" })
    .click();
  await page.getByLabel("Entry name", { exact: true }).fill("The Golden Stag");
  await page.getByRole("button", { name: "Save entry to draft" }).click();
  await expect(
    page.locator(".kingdom-card").filter({ hasText: "The Golden Stag" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
