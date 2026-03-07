import { expect, test } from "@playwright/test";

async function openTourChoice(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /welcome to manga blast/i })).toBeVisible();
}

test("short tour reaches the current add page tour step", async ({ page }) => {
  await openTourChoice(page);

  await page.getByRole("button", { name: /short tour/i }).click();
  await expect(page.getByText(/quick tour/i)).toBeVisible();

  await page.getByRole("button", { name: /next page/i }).click();
  await expect(page).toHaveURL(/\/add$/);
  await expect(page.getByText(/featured picks/i)).toBeVisible();
});

test("long tour progresses through add, series, bookmarks, stats, and install", async ({ page }) => {
  await openTourChoice(page);

  await page.getByRole("button", { name: /long tour/i }).click();
  await expect(page.getByText(/full tour/i)).toBeVisible();

  await page.getByRole("button", { name: /^next$/i }).click();
  await page.getByRole("button", { name: /^next$/i }).click();
  await page.getByRole("button", { name: /^next$/i }).click();
  await page.getByRole("button", { name: /next page/i }).click();
  await expect(page).toHaveURL(/\/add$/);

  await expect(page.getByText(/featured picks/i)).toBeVisible();
  await page.getByRole("button", { name: /^next$/i }).click();
  await expect(page.getByText(/search anything/i)).toBeVisible();
  await page.getByRole("button", { name: /^next$/i }).click();
  await expect(page.getByText(/source filter/i)).toBeVisible();
  await page.getByRole("button", { name: /next page/i }).click();
  await expect(page).toHaveURL(/\/series\/demo-tutorial-manga$/);

  await page.getByRole("button", { name: /^next$/i }).click();
  await page.getByRole("button", { name: /^next$/i }).click();
  await page.getByRole("button", { name: /^next$/i }).click();
  await page.getByRole("button", { name: /next page/i }).click();
  await expect(page).toHaveURL(/\/bookmarks$/);

  await page.getByRole("button", { name: /next page/i }).click();
  await expect(page).toHaveURL(/\/stats$/);

  await page.getByRole("button", { name: /^next$/i }).click();
  await page.getByRole("button", { name: /next page/i }).click();
  await expect(page).toHaveURL(/\/install$/);
});
