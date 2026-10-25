import { test, expect } from "@playwright/test";
test("one occupied-hex badge opens characters outside a city and stays stable through city entry", async ({
  page,
}) => {
  await page.goto("/");
  const badge = page.locator(".hex-population-marker");
  await expect(badge).toHaveCount(1);
  await expect(badge).toHaveText("1");
  await expect(page.locator(".location-label .population-badge")).toHaveCount(
    0,
  );
  await badge.click();
  await expect(
    page.getByRole("dialog", { name: "Characters here", exact: true }),
  ).toContainText("inside and outside cities");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByLabel("Search locations", { exact: true }).fill("Emberfall");
  await page.locator(".place-item").click();
  await page.getByRole("button", { name: "Enter city", exact: true }).click();
  await page.getByRole("button", { name: "Back to map", exact: true }).click();
  await expect(badge).toHaveCount(1);
  await expect(badge).toHaveText("1");
  await badge.click();
  await expect(
    page.getByRole("dialog", { name: "Characters here", exact: true }),
  ).toBeVisible();
});
