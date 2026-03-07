import { beforeEach, describe, expect, it } from "vitest";
import { initSourceHealthStore } from "../../src/lib/source-health-store";
import { collectSearchResults, type SearchResult } from "../../src/lib/search-aggregation";
import { getSourceAvailability, isSourceSearchable, resetSourceHealthForTests } from "../../src/lib/source-health";
import { useIsolatedSourceHealthStore } from "./source-health-test-helpers";

beforeEach(async () => {
  await useIsolatedSourceHealthStore("source-health-integration");
  resetSourceHealthForTests();
  await initSourceHealthStore();
});

function createResult(source: SearchResult["source"], title: string): SearchResult {
  return {
    title,
    coverUrl: "",
    sourceUrl: `https://example.org/${title}`,
    source,
  };
}

describe("source health integration", () => {
  it("does not hide a source after a single failing search run", async () => {
    resetSourceHealthForTests();

    await collectSearchResults("test", [
      { name: "weebcentral", fn: async () => { throw new Error("Timeout"); } },
    ]);

    expect(getSourceAvailability("weebcentral").status).toBe("healthy");
    expect(isSourceSearchable("weebcentral")).toBe(true);
  });

  it("keeps a source healthy after repeated search failures", async () => {
    resetSourceHealthForTests();

    await collectSearchResults("test", [
      { name: "weebcentral", fn: async () => { throw new Error("Timeout"); } },
    ]);
    await collectSearchResults("test", [
      { name: "weebcentral", fn: async () => { throw new Error("Timeout"); } },
    ]);

    expect(getSourceAvailability("weebcentral").status).toBe("healthy");
    expect(isSourceSearchable("weebcentral")).toBe(true);
  });

  it("clears accumulated failures after a successful run", async () => {
    resetSourceHealthForTests();

    await collectSearchResults("test", [
      { name: "mangabuddy", fn: async () => { throw new Error("Timeout"); } },
    ]);
    await collectSearchResults("test", [
      { name: "mangabuddy", fn: async () => [createResult("mangabuddy", "Recovered")] },
    ]);
    await collectSearchResults("test", [
      { name: "mangabuddy", fn: async () => { throw new Error("Timeout"); } },
    ]);

    expect(getSourceAvailability("mangabuddy").status).toBe("healthy");
    expect(isSourceSearchable("mangabuddy")).toBe(true);
  });
});
