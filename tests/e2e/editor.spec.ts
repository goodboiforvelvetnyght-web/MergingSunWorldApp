import { test, expect, type Page } from "@playwright/test";

async function newBorder(page: Page, count = 4) {
  await page.goto("/");
  await page.getByRole("button", { name: "World editor", exact: true }).click();
  await page.getByRole("button", { name: "New kingdom", exact: true }).click();
  await page.getByLabel("Kingdom name", { exact: true }).fill("Northmarch");
  await page
    .getByRole("button", { name: "Add border points", exact: true })
    .click();
  const map = page.getByTestId("world-map"),
    box = (await map.boundingBox())!;
  for (const [x, y] of [
    [0.27, 0.3],
    [0.62, 0.3],
    [0.62, 0.62],
    [0.27, 0.62],
  ].slice(0, count))
    await map.click({ position: { x: box.width * x, y: box.height * y } });
  await expect(page.locator(".border-handle")).toHaveCount(count);
  await page
    .getByRole("button", { name: "Finish drawing", exact: true })
    .click();
}
async function savedForm(page: Page) {
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("ms:border-draft:demo")!),
  );
}
async function center(page: Page, index: number) {
  const b = (await page.locator(".border-handle").nth(index).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test("dragging a spline point previews live and one undo reverses the complete drag", async ({
  page,
}) => {
  await newBorder(page);
  const before = await savedForm(page),
    point = await center(page, 0);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 70, point.y + 55, { steps: 12 });
  await page.mouse.up();
  const moved = await savedForm(page);
  expect(moved.points[0].x).toBeGreaterThan(before.points[0].x);
  expect(moved.points[0].y).toBeGreaterThan(before.points[0].y);
  expect(moved.points.slice(1)).toEqual(before.points.slice(1));
  await page
    .getByRole("button", { name: "Undo map edit", exact: true })
    .click();
  expect((await savedForm(page)).points).toEqual(before.points);
  await page
    .getByRole("button", { name: "Redo map edit", exact: true })
    .click();
  expect((await savedForm(page)).points).toEqual(moved.points);
  await page.getByLabel("Kingdom name", { exact: true }).focus();
  await page.keyboard.press("Control+z");
  expect((await savedForm(page)).points).toEqual(moved.points);
});

test("right-click edits points and inserts on a segment while preserving a closed border", async ({
  page,
}) => {
  await newBorder(page, 3);
  let p = await center(page, 0);
  await page.mouse.click(p.x, p.y, { button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "Delete point", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("menuitem", { name: "Make sharp corner", exact: true })
    .click();
  expect((await savedForm(page)).points[0].sharp).toBe(true);
  await expect(page.locator(".border-handle").first()).toHaveClass(/sharp/);
  await page
    .getByRole("button", { name: "Smooth border", exact: true })
    .click();
  const a = await center(page, 0),
    b = await center(page, 1);
  await page.mouse.click((a.x + b.x) / 2, (a.y + b.y) / 2, { button: "right" });
  await page
    .getByRole("menuitem", { name: "Insert point here", exact: true })
    .click();
  await expect(page.locator(".border-handle")).toHaveCount(4);
  p = await center(page, 1);
  await page.mouse.click(p.x, p.y, { button: "right" });
  await page
    .getByRole("menuitem", { name: "Delete point", exact: true })
    .click();
  await expect(page.locator(".border-handle")).toHaveCount(3);
  const form = await savedForm(page);
  expect(form.kingdom.borderStyle).toBe("straight");
  expect(form.points[0].sharp).toBe(true);
});

test("middle drag and wheel navigate without changing the active drawing tool or points", async ({
  page,
}) => {
  await newBorder(page);
  await page
    .getByRole("button", { name: "Add border points", exact: true })
    .click();
  const before = await savedForm(page),
    oldCenter = await center(page, 0);
  const map = page.getByTestId("world-map"),
    box = (await map.boundingBox())!;
  const x = box.x + box.width * 0.5,
    y = box.y + box.height * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(x + 65, y + 40, { steps: 8 });
  await page.mouse.up({ button: "middle" });
  const afterCenter = await center(page, 0);
  expect(Math.abs(afterCenter.x - oldCenter.x - 65)).toBeLessThanOrEqual(2);
  expect(Math.abs(afterCenter.y - oldCenter.y - 40)).toBeLessThanOrEqual(2);
  expect((await savedForm(page)).points).toEqual(before.points);
  await expect(
    page.getByRole("button", { name: "Add border points", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const zoom = Number(await map.getAttribute("data-map-zoom"));
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -300);
  await expect
    .poll(async () => Number(await map.getAttribute("data-map-zoom")))
    .toBeGreaterThan(zoom);
  expect((await savedForm(page)).points).toEqual(before.points);
});

test("a saved border form recovers after reload and publication stays a separate action", async ({
  page,
}) => {
  await newBorder(page);
  const form = await savedForm(page);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("ms:world:v1")!).territories.some(
        (k: any) => k.name === "Northmarch",
      ),
    ),
  ).toBe(false);
  await page.reload();
  await page.getByRole("button", { name: "World editor", exact: true }).click();
  await expect(page.getByLabel("Kingdom name", { exact: true })).toHaveValue(
    "Northmarch",
  );
  await expect(page.locator(".border-handle")).toHaveCount(4);
  expect((await savedForm(page)).points).toEqual(form.points);
  await page
    .getByRole("button", { name: "Save kingdom to draft", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save local world", exact: true })
    .click();
  const world = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ms:world:v1")!),
  );
  expect(
    world.territories.find((k: any) => k.name === "Northmarch"),
  ).toMatchObject({ borderStyle: "smooth", points: form.points });
  await page
    .getByRole("region", { name: "World hierarchy" })
    .getByRole("button", { name: "Northmarch", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Northmarch", exact: true }),
  ).toBeVisible();
});
