import { test, expect } from "@playwright/test";
test("atlas renders tiled map, filters locations, and opens shareable lore", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A world awaits." }),
  ).toBeVisible();
  await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search locations" })
    .fill("Thornwatch");
  await expect(page.locator(".place-item")).toHaveCount(1);
  await page.locator(".place-item").click();
  await expect(
    page.getByRole("heading", { name: "Thornwatch", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("At the edge of the Elderwood", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/#location=thornwatch/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Thornwatch", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("character creation, instant travel, cost display, history, and persistence", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "My character", exact: true }).click();
  await page
    .getByRole("button", { name: "Create your own demo character" })
    .click();
  await page.getByLabel("Character name", { exact: true }).fill("Rowan");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "The Sunward Reach", exact: true })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: /Emberfall Available birthplace/ })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByLabel("Backstory", { exact: true })
    .fill("A road to remember.");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await page.getByLabel("Your real name", { exact: true }).fill("Player Rowan");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Enter the world", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Rowan", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "World atlas", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search locations" })
    .fill("Thornwatch");
  await page.locator(".place-item").click();
  await page.getByText("Travel cost breakdown").click();
  await expect(page.locator(".cost-details")).toContainText("terrain");
  await page.getByRole("button", { name: /Travel here/ }).click();
  await page.getByRole("button", { name: "Confirm journey" }).click();
  await expect(
    page.getByText("You are here. Make yourself at home."),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("You are here. Make yourself at home."),
  ).toBeVisible();
  await page.getByRole("button", { name: "My character", exact: true }).click();
  await expect(page.locator(".journey-item")).toHaveCount(1);
  await expect(page.locator(".journey-item")).toContainText("Thornwatch");
  await expect(page.locator(".energy-label strong")).not.toHaveText(
    "100 / 100",
  );
});
test("editor saves lore and adding a river modifier supports undo", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "World editor", exact: true }).click();
  await page.locator('.location-marker[title="Thornwatch"]').click();
  await page
    .getByRole("button", { name: "Edit settlement / allegiance" })
    .click();
  await page.getByLabel("Settlement name").fill("Thornwatch Haven");
  await page
    .getByRole("textbox", { name: "Location lore" })
    .fill("A welcoming haven for travelers.");
  await page.getByRole("button", { name: "Save to world draft" }).click();
  await expect(
    page.getByRole("heading", { name: "Thornwatch Haven", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save local world" }).click();
  await page.getByRole("button", { name: "Landscape", exact: true }).click();
  await page.getByRole("button", { name: "Add river", exact: true }).click();
  const map = page.getByTestId("world-map");
  const box = (await map.boundingBox())!;
  await map.click({ position: { x: box.width * 0.48, y: box.height * 0.48 } });
  await expect(
    page.getByRole("button", { name: "Undo map edit" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Undo map edit" }).click();
  await expect(
    page.getByRole("button", { name: "Redo map edit" }),
  ).toBeEnabled();
  await page.reload();
  await page
    .getByRole("textbox", { name: "Search locations" })
    .fill("Thornwatch Haven");
  await expect(page.locator(".place-item")).toHaveCount(1);
  await page.locator(".place-item").click();
  await expect(page.locator(".lore-content")).toContainText(
    "A welcoming haven for travelers.",
  );
});
test("grid change returns traveler to original settlement without charging energy", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    const c = JSON.parse(localStorage.getItem("ms:character:v1")!);
    c.x = 735;
    c.y = 760;
    c.energy = 63;
    localStorage.setItem("ms:character:v1", JSON.stringify(c));
  });
  await page.reload();
  await page.getByRole("button", { name: "World editor", exact: true }).click();
  await page.getByRole("button", { name: "Landscape", exact: true }).click();
  await page.getByRole("button", { name: "Grid settings" }).click();
  await page.getByRole("slider", { name: "Hex radius" }).fill("48");
  await page.getByRole("button", { name: "Save local world" }).click();
  await expect(
    page.getByRole("dialog", { name: "Publish a new grid?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Publish grid & return characters" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const c = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ms:character:v1")!),
  );
  expect(c.originLocationId).toBe("emberfall");
  expect(c.energy).toBe(63);
  expect(Math.abs(c.x - 1090)).toBeLessThan(50);
  expect(Math.abs(c.y - 945)).toBeLessThan(50);
});
test("mobile map, layers, sidebar, and account dialog are usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByTestId("world-map")).toBeVisible();
  await page.getByRole("button", { name: "Map layers" }).click();
  await page.getByLabel("Hex grid", { exact: true }).check();
  await expect(page.getByLabel("Hex grid", { exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Open sidebar" }).click();
  await expect(
    page.getByRole("heading", { name: "A world awaits." }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search locations" })
    .fill("Sunspire");
  await page.locator(".place-item").click();
  await expect(
    page.getByRole("heading", { name: "Sunspire", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close location details" }).click();
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .last()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(
    page.getByRole("heading", { name: "Your story starts here" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("world editor directs phone users to the desktop workspace", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "World editor", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "World editor is a desktop workspace" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Return to player atlas" }).click();
  await expect(page.getByTestId("world-map")).toBeVisible();
});
