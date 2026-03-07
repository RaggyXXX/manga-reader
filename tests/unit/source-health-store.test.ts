import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSourceHealthStore,
  deleteSourceHealthRecord,
  getSourceHealthRecord,
  getSourceHealthSnapshot,
  initSourceHealthStore,
  saveSourceHealthRecord,
} from "../../src/lib/source-health-store";
import { useIsolatedSourceHealthStore } from "./source-health-test-helpers";

beforeEach(async () => {
  await useIsolatedSourceHealthStore("source-health-store");
  await initSourceHealthStore();
});

describe("source-health store", () => {
  it("persists a broken source record", async () => {
    await saveSourceHealthRecord({
      source: "weebcentral",
      status: "broken",
      reason: "chapter images failing",
      failureCount: 2,
      failedAt: 100,
      lastCheckedAt: 110,
      recheckAfter: 200,
    });

    await expect(getSourceHealthRecord("weebcentral")).resolves.toMatchObject({
      source: "weebcentral",
      status: "broken",
      reason: "chapter images failing",
      failureCount: 2,
      recheckAfter: 200,
    });
  });

  it("loads a snapshot after re-init", async () => {
    await saveSourceHealthRecord({
      source: "mangabuddy",
      status: "broken",
      reason: "proxy failed",
      failureCount: 3,
      failedAt: 120,
      lastCheckedAt: 121,
      recheckAfter: 300,
    });

    await initSourceHealthStore();

    await expect(getSourceHealthSnapshot()).resolves.toMatchObject({
      mangabuddy: {
        source: "mangabuddy",
        status: "broken",
        failureCount: 3,
      },
    });
  });

  it("deletes individual records", async () => {
    await saveSourceHealthRecord({
      source: "weebcentral",
      status: "broken",
      failureCount: 2,
      failedAt: 100,
      lastCheckedAt: 110,
      recheckAfter: 200,
    });

    await deleteSourceHealthRecord("weebcentral");

    await expect(getSourceHealthRecord("weebcentral")).resolves.toBeNull();
  });

  it("clears the whole store", async () => {
    await saveSourceHealthRecord({
      source: "weebcentral",
      status: "broken",
      failureCount: 2,
      failedAt: 100,
      lastCheckedAt: 110,
      recheckAfter: 200,
    });
    await saveSourceHealthRecord({
      source: "mangabuddy",
      status: "broken",
      failureCount: 4,
      failedAt: 130,
      lastCheckedAt: 140,
      recheckAfter: 250,
    });

    await clearSourceHealthStore();

    await expect(getSourceHealthSnapshot()).resolves.toEqual({});
  });
});
