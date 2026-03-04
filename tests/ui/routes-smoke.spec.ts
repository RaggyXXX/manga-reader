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

const seededChapters = {
  "smoke-series": {
    1: {
      number: 1,
      title: "Chapter 1",
      url: "https://example.org/series/smoke-series/chapter-1",
      imageUrls: ["https://example.org/image-1.jpg"],
      syncedAt: 1735689600000,
    },
    2: {
      number: 2,
      title: "Chapter 2",
      url: "https://example.org/series/smoke-series/chapter-2",
      imageUrls: ["https://example.org/image-2.jpg"],
      syncedAt: 1735689600000,
    },
  },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ series, chapters }) => {
      localStorage.setItem("manga-series", JSON.stringify(series));
      localStorage.setItem("manga-chapters", JSON.stringify(chapters));
      localStorage.setItem(
        "manga-reading-progress",
        JSON.stringify({
          "smoke-series": {
            chapter: 1,
            page: 1,
            updatedAt: Date.now(),
          },
        }),
      );
    },
    { series: seededSeries, chapters: seededChapters },
  );
});

test("home route renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("app-shell").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /manga reader/i })).toBeVisible();
});

test("add route renders", async ({ page }) => {
  await page.goto("/add");
  await expect(page.getByRole("heading", { name: /serie hinzufuegen/i })).toBeVisible();
});

test("stats route renders", async ({ page }) => {
  await page.goto("/stats");
  await expect(page.getByRole("heading", { name: /lesestatistiken/i })).toBeVisible();
});

test("series route renders", async ({ page }) => {
  await page.goto("/series/smoke-series");
  await expect(page.getByRole("heading", { name: /smoke series/i }).first()).toBeVisible();
});
