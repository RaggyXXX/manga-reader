import { expect, test } from "@playwright/test";

const seededSeries = {
  "smoke-series": {
    slug: "smoke-series",
    title: "Smoke Series",
    coverUrl: "",
    sourceUrl: "https://example.org/series/smoke-series",
    totalChapters: 2,
    addedAt: 1735689600000,
    source: "manhwazone",
  },
};

const seededUnsyncedChapters = {
  "smoke-series": {
    1: {
      number: 1,
      title: "Chapter 1",
      url: "https://example.org/series/smoke-series/chapter-1",
      imageUrls: [],
      syncedAt: null,
    },
    2: {
      number: 2,
      title: "Chapter 2",
      url: "https://example.org/series/smoke-series/chapter-2",
      imageUrls: [],
      syncedAt: null,
    },
  },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ series, chapters }) => {
      class MockWorker {
        onmessage = null;
        onerror = null;
        constructor(_url: string) {}
        postMessage(_message: unknown) {}
        terminate() {}
      }
      // @ts-expect-error test runtime override
      window.Worker = MockWorker;

      localStorage.setItem("manga-series", JSON.stringify(series));
      localStorage.setItem("manga-chapters", JSON.stringify(chapters));
      localStorage.setItem("tour-completed", "true");
    },
    { series: seededSeries, chapters: seededUnsyncedChapters },
  );
});

test("shows slim global sync bar above bottom nav on other pages", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByRole("link", { name: /smoke series/i }).first().click();
  await expect(page).toHaveURL(/\/series\/smoke-series$/);

  const seriesSyncButton = page.locator('[data-tour="series-sync"] button');
  await expect(seriesSyncButton).toBeVisible();
  await expect(seriesSyncButton).toBeEnabled();
  await seriesSyncButton.evaluate((button) => (button as HTMLButtonElement).click());

  await expect(page.getByRole("button", { name: /syncing/i })).toBeVisible();
  await expect(page.getByTestId("global-sync-slim")).toHaveCount(0);

  await page.getByRole("button", { name: /^stats$/i }).click();
  await expect(page).toHaveURL(/\/stats$/);
  await expect(page.getByTestId("global-sync-slim")).toBeVisible();
});
