import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkForUpdates } from "../../src/lib/update-checker";
import { markSourceBroken, resetSourceHealthForTests, setOutdatedSourcesForTests } from "../../src/lib/source-health";
import type { StoredSeries } from "../../src/lib/manga-store";

const baseSeries: StoredSeries = {
  slug: "series-1",
  title: "Series 1",
  coverUrl: "",
  sourceUrl: "https://example.org/series-1",
  totalChapters: 10,
  addedAt: 1,
  source: "mangadex",
  sourceId: "abc123",
};

describe("checkForUpdates source health guard", () => {
  beforeEach(() => {
    resetSourceHealthForTests();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns zero without remote calls for outdated sources", async () => {
    setOutdatedSourcesForTests(["mangakatana"]);

    const result = await checkForUpdates({
      ...baseSeries,
      source: "mangakatana",
      sourceId: undefined,
    });

    expect(result).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns zero without remote calls for broken sources", async () => {
    await markSourceBroken("weebcentral", "images failing");

    const result = await checkForUpdates({
      ...baseSeries,
      source: "weebcentral",
      sourceId: undefined,
    });

    expect(result).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still uses the existing fetch path for healthy sources", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ chapters: Array.from({ length: 13 }, (_, index) => ({ id: index })) }),
    } as Response);

    const result = await checkForUpdates(baseSeries);

    expect(result).toBe(3);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
