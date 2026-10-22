import { test, expect, type Page } from "@playwright/test";
async function openCreation(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "My character", exact: true }).click();
  await page
    .getByRole("button", { name: "Create your own demo character" })
    .click();
}
async function chooseBirthplace(page: Page) {
  await page
    .getByRole("button", { name: "The Sunward Reach", exact: true })
    .click();
  await expect(page.locator(".creation-lore")).toContainText(
    "A realm of old roads",
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator('.location-marker[title="Emberfall"]').click();
  await expect(page.locator(".creation-lore")).toContainText(
    "The city of a thousand hearths",
  );
  await page
    .getByRole("button", { name: "The Copper Stag", exact: true })
    .click();
  await expect(page.locator(".creation-entry")).toContainText(
    "always room for another story",
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

test("creation fills the viewport, supports lore and portraits, and replaces only on confirmation", async ({
  page,
}) => {
  await openCreation(page);
  await expect(
    page.getByRole("heading", { name: "Who are you?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toHaveCount(0);
  const box = (await page.locator(".creation-flow").boundingBox())!;
  expect(box.width).toBe(1440);
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeDisabled();
  const before = await page.evaluate(() =>
    localStorage.getItem("ms:character:v1"),
  );
  await page.getByLabel("Character name", { exact: true }).fill("Aster");
  await page.keyboard.press("Enter");
  await chooseBirthplace(page);
  await page
    .getByLabel("Backstory", { exact: true })
    .fill("A keeper of the last light.");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 40;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#a77845";
    ctx.fillRect(0, 0, 40, 40);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page
    .getByLabel("Choose a portrait")
    .setInputFiles({
      name: "portrait.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
  await expect(page.getByAltText("Character portrait preview")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Your real name is visible only to you and the admins.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByLabel("Your real name", { exact: true }).fill("Aster Player");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  expect(
    await page.evaluate(() => localStorage.getItem("ms:character:v1")),
  ).toBe(before);
  await expect(
    page.getByRole("button", { name: "Enter the world", exact: true }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Enter the world", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Aster", exact: true }),
  ).toBeVisible();
  await expect(page.getByAltText("Aster portrait")).toBeVisible();
  const created = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ms:character:v1")!),
  );
  expect(created.originLocationId).toBe("emberfall");
  expect(created.realName).toBe("Aster Player");
  expect(created.bio).toBe("A keeper of the last light.");
  expect(created.portrait).toMatch(/^data:image\/jpeg;base64,/);
});

test("draft survives refresh and back navigation on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCreation(page);
  await page.getByLabel("Character name", { exact: true }).fill("Mira");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await chooseBirthplace(page);
  await page
    .getByLabel("Backstory", { exact: true })
    .fill("A story saved for later.");
  await page.reload();
  await page.getByRole("button", { name: "My character", exact: true }).click();
  await page
    .getByRole("button", { name: "Create your own demo character" })
    .click();
  await expect(page.getByLabel("Backstory", { exact: true })).toHaveValue(
    "A story saved for later.",
  );
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Emberfall Available birthplace/ }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Close character creation" }).click();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
});

test("a kingdom can be selected directly on the map", async ({ page }) => {
  await openCreation(page);
  await page.getByLabel("Character name", { exact: true }).fill("Map Traveler");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const map = page.getByTestId("world-map"),
    box = (await map.boundingBox())!;
  const fit =
    Math.floor(
      Math.log2(Math.min((box.width - 40) / 300, (box.height - 40) / 225)) /
        0.25,
    ) * 0.25;
  const scale = 2 ** Math.max(0, fit) / 8;
  await map.click({
    position: {
      x: box.width / 2 + (1120 - 1200) * scale,
      y: box.height / 2 + (1100 - 900) * scale,
    },
  });
  await expect(
    page.getByRole("button", { name: "The Sunward Reach", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("roads can be painted, undone and erased without changing rivers or terrain", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "World editor", exact: true }).click();
  await page.getByRole("button", { name: "Landscape", exact: true }).click();
  await page.getByRole("button", { name: "Add road", exact: true }).click();
  const map = page.getByTestId("world-map"),
    box = (await map.boundingBox())!;
  await map.click({ position: { x: box.width * 0.48, y: box.height * 0.48 } });
  await page.getByRole("button", { name: "Save local world" }).click();
  const painted = await page.evaluate(
    () => JSON.parse(localStorage.getItem("ms:world:v1")!).tiles,
  );
  const id = Object.keys(painted).find((k) => painted[k].road)!;
  expect(id).toBeTruthy();
  await page.getByRole("button", { name: "Erase road", exact: true }).click();
  await map.click({ position: { x: box.width * 0.48, y: box.height * 0.48 } });
  await page.getByRole("button", { name: "Save local world" }).click();
  const erased = await page.evaluate(
    (id) => JSON.parse(localStorage.getItem("ms:world:v1")!).tiles[id],
    id,
  );
  expect(erased).toEqual({ ...painted[id], road: false });
});

test("admin activation has a dedicated sign-in page", async ({ page }) => {
  await page.goto("/admin/activate");
  await expect(
    page.getByRole("heading", { name: "Admin access", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Welcome back, traveler" }),
  ).toBeVisible();
});
