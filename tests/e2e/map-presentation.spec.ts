import { test, expect } from "@playwright/test";
test("presentation previews, validates, recovers and publishes without moving the world", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "World editor", exact: true }).click();
  await page
    .getByRole("button", { name: "Map presentation", exact: true })
    .click();
  const map = page.getByTestId("world-map");
  await expect(
    page.getByRole("heading", { name: "Map presentation", exact: true }),
  ).toBeVisible();
  const original = await page.evaluate(() =>
    localStorage.getItem("ms:world:v1"),
  );
  await page.getByLabel("Minimum zoom", { exact: true }).fill("0");
  await page.getByLabel("Maximum zoom", { exact: true }).fill("4");
  await page.getByLabel("Default zoom", { exact: true }).fill("2");
  await page
    .getByLabel("Starting view", { exact: true })
    .selectOption("default");
  await page
    .getByRole("button", { name: "Preview starting view", exact: true })
    .click();
  await expect(map).toHaveAttribute("data-map-zoom", "2");
  await expect(map).toHaveAttribute("data-map-min-zoom", "0");
  await expect(map).toHaveAttribute("data-map-max-zoom", "4");
  await page.getByLabel("city base size", { exact: true }).fill("40");
  await expect(page.locator(".location-dot.city").first()).toHaveCSS(
    "width",
    "40px",
  );
  await page.getByLabel("Default zoom", { exact: true }).fill("5");
  await expect(page.getByRole("alert")).toContainText("Zoom levels");
  await expect(
    page.getByRole("button", { name: "Save local world" }),
  ).toBeDisabled();
  await page.getByLabel("Default zoom", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem("ms:world:v1"))).toBe(
    original,
  );
  await page.reload();
  await page.getByRole("button", { name: "World editor", exact: true }).click();
  await page
    .getByRole("button", { name: "Map presentation", exact: true })
    .click();
  await expect(page.getByLabel("city base size", { exact: true })).toHaveValue(
    "40",
  );
  await page.getByRole("button", { name: "Save local world" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("ms:world:v1")!).mapPresentation.icons
            .city.size,
      ),
    )
    .toBe(40);
  await page.getByRole("button", { name: "Landscape", exact: true }).click();
  await expect(map).toHaveAttribute("data-map-max-zoom", "7");
});

test("character creation inherits published presentation while retaining kingdom selection", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    const world = JSON.parse(localStorage.getItem("ms:world:v1")!);
    world.mapPresentation = {
      ...world.mapPresentation,
      minZoom: 0,
      maxZoom: 4,
      defaultZoom: 2,
      startView: "default",
    };
    world.mapPresentation.icons.city = {
      ...world.mapPresentation.icons.city,
      size: 40,
      scaling: "fixed",
      minZoom: 3,
      labelMinZoom: 3,
    };
    localStorage.setItem("ms:world:v1", JSON.stringify(world));
  });
  await page.reload();
  await page.getByRole("button", { name: "My character", exact: true }).click();
  await page
    .getByRole("button", { name: "Create your own demo character" })
    .click();
  await page
    .getByLabel("Character name", { exact: true })
    .fill("Presentation traveler");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const map = page.getByTestId("world-map");
  await expect(map).toHaveAttribute("data-map-min-zoom", "0");
  await expect(map).toHaveAttribute("data-map-max-zoom", "4");
  await expect(map).toHaveAttribute("data-map-zoom", "2");
  await page.locator(".leaflet-interactive").first().click({ force: true });
  // List selection is always available, even when icons are hidden at this zoom.
  await page
    .getByRole("button", { name: "The Sunward Reach", exact: true })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator('.location-marker[title="Emberfall"]')).toHaveCount(
    0,
  );
  for (let i = 0; i < 4; i++) {
    const zoom = Number(await map.getAttribute("data-map-zoom"));
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect(map).toHaveAttribute(
      "data-map-zoom",
      String(Math.min(4, zoom + 0.5)),
    );
  }
  await expect(
    page.locator('.location-marker[title="Emberfall"] .location-dot'),
  ).toHaveCSS("width", "40px");
  await expect(
    page.locator('.location-marker[title="Emberfall"] .location-label'),
  ).toBeVisible();
});
