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
    },
    { series: seededSeries, chapters: seededChapters },
  );
});

test("reader route renders controls and chapter context", async ({ page }) => {
  await page.goto("/read/smoke-series/1");
  await expect(page.getByRole("button", { name: /einstellungen/i })).toBeVisible();
  await expect(page.getByText(/kap\.\s*1/i)).toBeVisible();
});
