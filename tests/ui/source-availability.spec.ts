import { expect, test } from "@playwright/test";

test.afterEach(async ({ request }) => {
  await request.delete("/api/dev/source-health");
});

test("add page hides blocked sources from the source filter", async ({ page, request }) => {
  await request.post("/api/dev/source-health", {
    data: {
      outdated: ["mangakatana"],
      broken: [{ source: "weebcentral", reason: "scrape failed" }],
    },
  });

  await page.goto("/add");
  await page.waitForResponse((response) => response.url().includes("/api/source-health") && response.ok());

  await page.locator('[data-tour="add-source-filter"] button').click();

  const dropdown = page.locator('[data-tour="add-source-filter"] > div').last();
  await expect(dropdown.getByRole("button", { name: /^MangaDex$/i })).toBeVisible();
  await expect(dropdown.getByRole("button", { name: /^Manhwazone$/i })).toBeVisible();
  await expect(dropdown.getByRole("button", { name: /^Atsumaru$/i })).toBeVisible();
  await expect(dropdown.getByRole("button", { name: /^MangaBuddy$/i })).toBeVisible();
  await expect(dropdown.getByRole("button", { name: /^MangaKatana$/i })).toHaveCount(0);
  await expect(dropdown.getByRole("button", { name: /^WeebCentral$/i })).toHaveCount(0);
});


test("repaired sources appear in the add filter again after reset", async ({ page, request }) => {
  await request.post("/api/dev/source-health", {
    data: {
      broken: [{ source: "weebcentral", reason: "scrape failed" }],
    },
  });

  await page.goto("/add");
  await page.waitForResponse((response) => response.url().includes("/api/source-health") && response.ok());
  await page.locator('[data-tour="add-source-filter"] button').click();
  const dropdown = page.locator('[data-tour="add-source-filter"] > div').last();
  await expect(dropdown.getByRole("button", { name: /^WeebCentral$/i })).toHaveCount(0);

  await request.delete("/api/dev/source-health");
  await page.reload();
  await page.waitForResponse((response) => response.url().includes("/api/source-health") && response.ok());
  await page.locator('[data-tour="add-source-filter"] button').click();
  await expect(page.locator('[data-tour="add-source-filter"] > div').last().getByRole("button", { name: /^WeebCentral$/i })).toBeVisible();
});

test("library card shows a subtle retired-source notice", async ({ page, request }) => {
  await request.post("/api/dev/source-health", {
    data: {
      outdated: ["mangakatana"],
    },
  });

  await page.addInitScript(() => {
    localStorage.setItem("manga-series", JSON.stringify({
      "retired-series": {
        slug: "retired-series",
        title: "Retired Series",
        coverUrl: "",
        sourceUrl: "https://example.org/retired-series",
        totalChapters: 12,
        addedAt: Date.now(),
        source: "mangakatana",
      },
    }));
    localStorage.setItem("manga-chapters", JSON.stringify({
      "retired-series": {
        1: {
          number: 1,
          title: "Chapter 1",
          url: "https://example.org/retired-series/chapter-1",
          imageUrls: ["https://example.org/image-1.jpg"],
          syncedAt: Date.now(),
        },
      },
    }));
  });

  await page.goto("/");
  await page.waitForResponse((response) => response.url().includes("/api/source-health") && response.ok());

  await expect(page.getByText(/retired series/i)).toBeVisible();
  await expect(page.getByText(/source retired/i).first()).toBeVisible();
});

test("series page shows a calm temporarily-unavailable source banner", async ({ page, request }) => {
  await request.post("/api/dev/source-health", {
    data: {
      broken: [{ source: "weebcentral", reason: "chapter images failing" }],
    },
  });

  await page.addInitScript(() => {
    localStorage.setItem("manga-series", JSON.stringify({
      "broken-series": {
        slug: "broken-series",
        title: "Broken Series",
        coverUrl: "",
        sourceUrl: "https://example.org/broken-series",
        totalChapters: 12,
        addedAt: Date.now(),
        source: "weebcentral",
      },
    }));
    localStorage.setItem("manga-chapters", JSON.stringify({
      "broken-series": {
        1: {
          number: 1,
          title: "Chapter 1",
          url: "https://example.org/broken-series/chapter-1",
          imageUrls: ["https://example.org/image-1.jpg"],
          syncedAt: Date.now(),
        },
      },
    }));
  });

  await page.goto("/series/broken-series");
  await page.waitForResponse((response) => response.url().includes("/api/source-health") && response.ok());

  await expect(page.getByRole("heading", { name: /broken series/i })).toBeVisible();
  await expect(page.getByText(/updates are currently unavailable/i)).toBeVisible();
  await expect(page.getByText(/saved chapters stay readable/i)).toBeVisible();
});
