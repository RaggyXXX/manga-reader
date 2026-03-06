import { expect, test } from "@playwright/test";

test("add page shows featured manga before any search and opens preview on click", async ({ page }) => {
  await page.goto("/add");

  await expect(page.getByRole("heading", { name: /featured/i })).toBeVisible();
  const featuredCards = page.locator('section[aria-label="Featured manga"] button');
  await expect(featuredCards).toHaveCount(20);

  await featuredCards.first().click();
  await expect(page.getByRole("button", { name: /close/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /add series/i })).toBeVisible();
});
