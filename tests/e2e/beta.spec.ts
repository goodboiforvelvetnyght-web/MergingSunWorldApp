import { test, expect, type Page } from "@playwright/test";

test.describe("Title screen", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("custom artwork and logo lead to Google/email login and registration", async ({
    page,
  }) => {
    const tiles: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/map/tiles/")) tiles.push(r.url());
    });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Click to start", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("world-map")).toHaveCount(0);
    await expect
      .poll(() =>
        page
          .locator(".title-logo")
          .evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0),
      )
      .toBe(true);
    await expect
      .poll(() =>
        page
          .locator(".title-art img")
          .evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0),
      )
      .toBe(true);
    expect(tiles).toEqual([]);
    await page.screenshot({ path: "/tmp/merging-sun-title-desktop.png" });
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Your story belongs here." }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Create an account", exact: true })
      .click();
    await expect(
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Create account", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue with Google", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByLabel("Email address", { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();
    expect(tiles).toEqual([]);
  });
  test("title screen fits a phone and respects reduced motion", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Click to start", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(390);
    expect(
      await page
        .locator(".title-prompt")
        .evaluate((e) => getComputedStyle(e).animationName),
    ).toBe("none");
    await page.screenshot({ path: "/tmp/merging-sun-title-mobile.png" });
    await page
      .getByRole("button", { name: "Click to start", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Create an account", exact: true }),
    ).toBeVisible();
  });
});
async function character(page: Page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("ms:character:v1")!),
  );
}
async function openHome(page: Page) {
  await page.goto("/");
  if ((page.viewportSize()?.width ?? 1440) < 820)
    await page
      .getByRole("button", { name: "Open sidebar", exact: true })
      .click();
  await page
    .getByRole("textbox", { name: "Search locations" })
    .fill("Emberfall");
  await page.locator(".place-item").click();
}
test("city entry is explicit, map navigation preserves the room, and leaving preserves energy", async ({
  page,
}) => {
  await openHome(page);
  const before = await character(page);
  expect(before.currentLocationId).toBeNull();
  await page.getByRole("button", { name: "Enter city", exact: true }).click();
  const city = page.getByRole("region", {
    name: "Emberfall city view",
    exact: true,
  });
  await expect(city).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  await expect(page.locator(".topbar")).toBeVisible();
  await expect(city).toContainText("Inside Emberfall");
  expect((await character(page)).energy).toBe(before.energy);
  await city.getByRole("button", { name: /The Copper Stag/ }).click();
  await city
    .getByRole("button", { name: "Enter The Copper Stag", exact: true })
    .click();
  await expect(city).toContainText("You are here");
  const inside = await character(page);
  expect(inside.currentLocationId).toBe("emberfall");
  expect(inside.internalLocationId).toBe("copper-stag");
  await page.screenshot({ path: "/tmp/merging-sun-city-desktop.png" });
  await city.getByRole("button", { name: "Back to map", exact: true }).click();
  await expect(city).toHaveCount(0);
  expect(await character(page)).toEqual(inside);
  await page
    .locator(".city-return-bar")
    .getByRole("button", { name: "Return to city", exact: true })
    .click();
  await expect(city).toContainText("You are here");
  expect(await character(page)).toEqual(inside);
  await city.getByRole("button", { name: "Leave city", exact: true }).click();
  const outside = await character(page);
  expect(outside).toEqual({
    ...inside,
    currentLocationId: null,
    internalLocationId: null,
  });
  await expect(page.locator(".city-return-bar")).toHaveCount(0);
  await page.getByRole("button", { name: "Enter city", exact: true }).click();
  await city.getByRole("button", { name: "Back to map", exact: true }).click();
  await page.reload();
  expect((await character(page)).currentLocationId).toBe("emberfall");
  await page
    .locator(".city-return-bar")
    .getByRole("button", { name: "Return to city", exact: true })
    .click();
  await expect(city).toBeVisible();
});
test("remote city lore does not move a character or allow internal entry", async ({
  page,
}) => {
  await page.goto("/");
  const before = await character(page);
  await page
    .getByRole("textbox", { name: "Search locations" })
    .fill("Thornwatch");
  await page.locator(".place-item").click();
  await page.getByRole("button", { name: "View city", exact: true }).click();
  const city = page.getByRole("region", {
    name: "Thornwatch city view",
    exact: true,
  });
  await expect(
    city.getByRole("button", { name: "Enter city", exact: true }),
  ).toBeDisabled();
  await city.getByRole("button", { name: /Town Commons/ }).click();
  await expect(
    city.getByRole("button", { name: "Enter Town Commons", exact: true }),
  ).toBeDisabled();
  expect(await character(page)).toEqual(before);
});
test("artwork opacity is a local editor preference and the player map remains opaque", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "World editor", exact: true }).click();
  await page.getByLabel("Map artwork opacity", { exact: true }).fill("40");
  await expect(page.locator(".leaflet-tile-pane > .leaflet-layer")).toHaveCSS(
    "opacity",
    "0.4",
  );
  await page.getByRole("button", { name: "Landscape", exact: true }).click();
  await expect(
    page.getByLabel("Map artwork opacity", { exact: true }),
  ).toHaveValue("40");
  await page.reload();
  await page.getByRole("button", { name: "World editor", exact: true }).click();
  await expect(
    page.getByLabel("Map artwork opacity", { exact: true }),
  ).toHaveValue("40");
  await page.getByRole("button", { name: "World atlas", exact: true }).click();
  await expect(
    page.getByLabel("Map artwork opacity", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".leaflet-tile-pane > .leaflet-layer")).toHaveCSS(
    "opacity",
    "1",
  );
});
test("guide explains waiting, city navigation and upcoming chat/events, and can be reopened", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Player guide", exact: true }).click();
  const guide = page.getByRole("dialog", {
    name: "Your story begins here",
    exact: true,
  });
  await expect(guide).toContainText("while your character awaits approval");
  await expect(guide).toContainText("Future updates");
  await expect(guide).toContainText("Back to map only changes your view");
  await guide
    .getByRole("button", { name: "Explore the lore", exact: true })
    .click();
  await expect(guide).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Lore library", exact: true }),
  ).toHaveClass(/active/);
  await page.getByRole("button", { name: "Player guide", exact: true }).click();
  await expect(guide).toBeVisible();
});
test("city view remains usable on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);
  await page.getByRole("button", { name: "Enter city", exact: true }).click();
  const city = page.getByRole("region", {
    name: "Emberfall city view",
    exact: true,
  });
  await expect(city).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await city.getByRole("button", { name: /Town Commons/ }).click();
  await city
    .getByRole("button", { name: "Enter Town Commons", exact: true })
    .click();
  await city.getByRole("button", { name: "Back to map", exact: true }).click();
  await page
    .locator(".city-return-bar")
    .getByRole("button", { name: "Return to city", exact: true })
    .click();
  await expect(city).toContainText("You are here");
  await page.screenshot({ path: "/tmp/merging-sun-city-mobile.png" });
});
