import { beforeEach, describe, expect, it } from "vitest";
import { getSourceAvailability, getAllSourceAvailability, resetSourceHealthForTests, setOutdatedSourcesForTests, syncSourceHealthFromStore } from "../../src/lib/source-health";
import { initSourceHealthStore, saveSourceHealthRecord } from "../../src/lib/source-health-store";
import { useIsolatedSourceHealthStore } from "./source-health-test-helpers";

beforeEach(async () => {
  await useIsolatedSourceHealthStore("source-health-persistence");
  resetSourceHealthForTests();
  await initSourceHealthStore();
});

describe("source-health persistence", () => {
  it("loads persisted broken status into effective availability", async () => {
    const now = Date.now();
    await saveSourceHealthRecord({
      source: "weebcentral",
      status: "broken",
      reason: "chapter images failing",
      failureCount: 2,
      failedAt: now - 1000,
      lastCheckedAt: now - 500,
      recheckAfter: now + 60_000,
    });

    await syncSourceHealthFromStore();

    expect(getSourceAvailability("weebcentral").status).toBe("broken");
    expect(getSourceAvailability("weebcentral").reason).toBe("chapter images failing");
  });

  it("keeps outdated overlay higher priority than persisted data", async () => {
    setOutdatedSourcesForTests(["mangakatana"]);
    await saveSourceHealthRecord({
      source: "mangakatana",
      status: "healthy",
      failureCount: 0,
      failedAt: 0,
      lastCheckedAt: 0,
      recheckAfter: 0,
    });

    await syncSourceHealthFromStore();

    expect(getSourceAvailability("mangakatana").status).toBe("outdated");
  });

  it("exposes persisted records in the full snapshot", async () => {
    const now = Date.now();
    await saveSourceHealthRecord({
      source: "mangabuddy",
      status: "broken",
      reason: "proxy failed",
      failureCount: 3,
      failedAt: now - 1000,
      lastCheckedAt: now - 500,
      recheckAfter: now + 60_000,
    });

    await syncSourceHealthFromStore();

    expect(getAllSourceAvailability().mangabuddy).toMatchObject({
      status: "broken",
      reason: "proxy failed",
    });
  });
});
