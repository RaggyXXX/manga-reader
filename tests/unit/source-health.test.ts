import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BROKEN_SOURCE_TTL_MS,
  clearSourceBroken,
  getSourceAvailability,
  getSourceNotice,
  isSourceSearchable,
  isSourceSyncable,
  listSearchableSources,
  markSourceBroken,
  resetSourceHealthForTests,
  setOutdatedSourcesForTests,
  shouldRecheckSource,
} from "../../src/lib/source-health";

describe("source-health", () => {
  beforeEach(() => {
    resetSourceHealthForTests();
    setOutdatedSourcesForTests([]);
    vi.useRealTimers();
  });

  it("treats outdated sources as non-searchable and non-syncable", () => {
    setOutdatedSourcesForTests(["mangakatana"]);

    expect(getSourceAvailability("mangakatana").status).toBe("outdated");
    expect(isSourceSearchable("mangakatana")).toBe(false);
    expect(isSourceSyncable("mangakatana")).toBe(false);
  });

  it("keeps healthy sources searchable and syncable", () => {
    expect(getSourceAvailability("mangadex").status).toBe("healthy");
    expect(isSourceSearchable("mangadex")).toBe(true);
    expect(isSourceSyncable("mangadex")).toBe(true);
  });

  it("keeps broken sources unavailable until a recheck succeeds", async () => {
    vi.useFakeTimers();

    await markSourceBroken("weebcentral", "scrape failed");
    expect(getSourceAvailability("weebcentral").status).toBe("broken");
    expect(isSourceSearchable("weebcentral")).toBe(false);
    expect(isSourceSyncable("weebcentral")).toBe(false);

    vi.advanceTimersByTime(BROKEN_SOURCE_TTL_MS + 1);

    expect(getSourceAvailability("weebcentral").status).toBe("broken");
    expect(shouldRecheckSource("weebcentral")).toBe(true);
    expect(isSourceSearchable("weebcentral")).toBe(false);
    expect(isSourceSyncable("weebcentral")).toBe(false);
  });

  it("can clear a broken source manually", async () => {
    await markSourceBroken("mangabuddy", "preview failed");
    clearSourceBroken("mangabuddy");

    expect(getSourceAvailability("mangabuddy").status).toBe("healthy");
  });

  it("returns calm notice copy for broken and outdated states", async () => {
    await markSourceBroken("manhwazone", "chapter images failing");
    setOutdatedSourcesForTests(["mangakatana"]);

    expect(getSourceNotice("manhwazone")).toMatchObject({
      tone: "warning",
      title: "Source temporarily unavailable",
    });
    expect(getSourceNotice("mangakatana")).toMatchObject({
      tone: "muted",
      title: "Source retired",
    });
    expect(getSourceNotice("mangadex")).toBeNull();
  });

  it("lists only searchable sources", async () => {
    setOutdatedSourcesForTests(["mangakatana"]);
    await markSourceBroken("weebcentral", "scrape failed");

    expect(listSearchableSources()).toEqual(
      expect.arrayContaining(["mangadex", "manhwazone", "atsumaru", "mangabuddy"])
    );
    expect(listSearchableSources()).not.toContain("mangakatana");
    expect(listSearchableSources()).not.toContain("weebcentral");
  });
});
