import { describe, expect, it, vi } from "vitest";
import { collectSearchResults, type SearchError, type SearchResult, type SearchSourceRunner } from "../../src/lib/search-aggregation";
import { markSourceBroken, resetSourceHealthForTests, setOutdatedSourcesForTests } from "../../src/lib/source-health";

function createResult(source: SearchResult["source"], title: string): SearchResult {
  return {
    title,
    coverUrl: `https://example.com/${title}.jpg`,
    sourceUrl: `https://example.com/${title}`,
    source,
  };
}

describe("collectSearchResults", () => {
  it("excludes outdated and broken sources before fan-out", async () => {
    resetSourceHealthForTests();
    setOutdatedSourcesForTests(["mangakatana"]);
    await markSourceBroken("weebcentral", "scrape failed");

    const mangakatana = vi.fn<() => Promise<SearchResult[]>>().mockResolvedValue([createResult("mangakatana", "Old")]);
    const weebcentral = vi.fn<() => Promise<SearchResult[]>>().mockResolvedValue([createResult("weebcentral", "Broken")]);
    const mangadex = vi.fn<() => Promise<SearchResult[]>>().mockResolvedValue([createResult("mangadex", "Healthy")]);

    const { results } = await collectSearchResults("test", [
      { name: "mangakatana", fn: mangakatana },
      { name: "weebcentral", fn: weebcentral },
      { name: "mangadex", fn: mangadex },
    ]);

    expect(mangakatana).not.toHaveBeenCalled();
    expect(weebcentral).not.toHaveBeenCalled();
    expect(mangadex).toHaveBeenCalledTimes(1);
    expect(results.map((result) => result.source)).toEqual(["mangadex"]);
  });

  it("filters unavailable results even if a runner returns them", async () => {
    resetSourceHealthForTests();
    await markSourceBroken("mangabuddy", "images failing");

    const { results } = await collectSearchResults("test", [
      {
        name: "mangadex",
        fn: async () => [createResult("mangadex", "Alpha"), createResult("mangabuddy", "Leaked")],
      },
    ]);

    expect(results.map((result) => result.source)).toEqual(["mangadex"]);
  });

  it("keeps errors for active sources", async () => {
    resetSourceHealthForTests();

    const { errors } = await collectSearchResults("test", [
      { name: "mangadex", fn: async () => [createResult("mangadex", "Alpha")] },
      { name: "manhwazone", fn: async () => { throw new Error("Timeout"); } },
    ]);

    expect(errors).toEqual<SearchError[]>([
      { source: "manhwazone", message: "Timeout" },
    ]);
  });

  it("sorts results by relevance after filtering", async () => {
    resetSourceHealthForTests();

    const sources: SearchSourceRunner[] = [
      {
        name: "mangadex",
        fn: async () => [
          createResult("mangadex", "Naruto"),
          createResult("mangadex", "Boruto Naruto Next Generations"),
        ],
      },
    ];

    const { results } = await collectSearchResults("Naruto", sources);

    expect(results.map((result) => result.title)).toEqual([
      "Naruto",
      "Boruto Naruto Next Generations",
    ]);
  });
});
