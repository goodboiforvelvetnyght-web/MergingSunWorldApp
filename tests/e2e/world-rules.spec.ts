import { test, expect, type Page } from "@playwright/test";

async function saveDraft(page: Page) {
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("ms:draft:demo")!),
  );
}

test("World Rules validates costs, recovers drafts, publishes, and restores defaults", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "World editor", exact: true }).click();
  await page.getByRole("button", { name: "World Rules", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Travel costs", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("mountain walking", { exact: true }),
  ).toHaveValue("road-required");
  await expect(
    page.getByLabel("mountain road effect", { exact: true }),
  ).toHaveValue("passage-only");
  const original = await page.evaluate(() =>
    localStorage.getItem("ms:world:v1"),
  );
  await page.getByLabel("plains energy cost", { exact: true }).fill("0");
  await expect(page.getByRole("alert")).toContainText("Invalid plains rule");
  await expect(
    page.getByRole("button", { name: "Save local world" }),
  ).toBeDisabled();
  await page.getByLabel("plains energy cost", { exact: true }).fill("3");
  await page
    .getByLabel("forest road effect", { exact: true })
    .selectOption("none");
  expect((await saveDraft(page)).travelRules.terrain.plains.cost).toBe(3);
  expect(await page.evaluate(() => localStorage.getItem("ms:world:v1"))).toBe(
    original,
  );
  await page.reload();
  await page.getByRole("button", { name: "World editor", exact: true }).click();
  await page.getByRole("button", { name: "World Rules", exact: true }).click();
  await expect(
    page.getByLabel("plains energy cost", { exact: true }),
  ).toHaveValue("3");
  await page.getByRole("button", { name: "Save local world" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("ms:world:v1")!).travelRules.terrain
            .plains.cost,
      ),
    )
    .toBe(3);
  await page
    .getByRole("button", { name: "Restore defaults", exact: true })
    .click();
  await expect(
    page.getByLabel("plains energy cost", { exact: true }),
  ).toHaveValue("2");
  await page
    .getByRole("button", { name: "Undo map edit", exact: true })
    .click();
  await expect(
    page.getByLabel("plains energy cost", { exact: true }),
  ).toHaveValue("3");
  await page.screenshot({ path: "/tmp/merging-sun-world-rules.png" });
  await page.getByRole("button", { name: "Landscape", exact: true }).click();
  await expect(page.getByTestId("world-map")).toBeVisible();
});

test("base and feature brushes preserve roads and rivers, with exclusive elevations and undo", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "World editor", exact: true }).click();
  await page.getByRole("button", { name: "Landscape", exact: true }).click();
  const map = page.getByTestId("world-map"),
    box = (await map.boundingBox())!;
  const paint = () =>
    map.click({ position: { x: box.width * 0.48, y: box.height * 0.48 } });
  await page.getByRole("button", { name: "Add road", exact: true }).click();
  await paint();
  await page.getByRole("button", { name: "Add river", exact: true }).click();
  await paint();
  await page.getByRole("button", { name: "Terrain", exact: true }).click();
  await page
    .locator(".terrain-options button")
    .filter({ hasText: "desert" })
    .click();
  await paint();
  const tiles = (await saveDraft(page)).tiles;
  const id = Object.keys(tiles).find((k) => tiles[k].road && tiles[k].river)!;
  expect(tiles[id].terrain).toBe("desert");
  await page.getByRole("button", { name: "Add feature", exact: true }).click();
  for (const f of ["forest", "hills", "mountain"]) {
    await page
      .locator(".terrain-options button")
      .filter({ hasText: f })
      .click();
    await paint();
  }
  expect((await saveDraft(page)).tiles[id]).toEqual({
    terrain: "desert",
    features: ["forest", "mountain"],
    river: true,
    road: true,
  });
  await page
    .getByRole("button", { name: "Undo map edit", exact: true })
    .click();
  expect((await saveDraft(page)).tiles[id].features).toEqual([
    "forest",
    "hills",
  ]);
  await page
    .getByRole("button", { name: "Erase feature", exact: true })
    .click();
  await page
    .locator(".terrain-options button")
    .filter({ hasText: "forest" })
    .click();
  await paint();
  expect((await saveDraft(page)).tiles[id]).toEqual({
    terrain: "desert",
    features: ["hills"],
    river: true,
    road: true,
  });
});
