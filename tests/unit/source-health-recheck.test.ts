import { beforeEach, describe, expect, it } from "vitest";
import {
  getSourceAvailability,
  isSourceSearchable,
  recordSourceFailure,
  recordSourceSuccess,
  resetSourceHealthForTests,
  shouldRecheckSource,
  syncSourceHealthFromStore,
} from "../../src/lib/source-health";
import { initSourceHealthStore } from "../../src/lib/source-health-store";
import { useIsolatedSourceHealthStore } from "./source-health-test-helpers";

beforeEach(async () => {
  await useIsolatedSourceHealthStore("source-health-recheck");
  resetSourceHealthForTests();
  await initSourceHealthStore();
});

describe("source-health recheck scheduling", () => {
  it("marks a source broken after repeated failures and sets a future recheck", async () => {
    const now = 1_000_000;

    await recordSourceFailure("weebcentral", "scrape failed", now);
    await recordSourceFailure("weebcentral", "scrape failed", now + 1);
    await syncSourceHealthFromStore();

    expect(getSourceAvailability("weebcentral")).toMatchObject({
      status: "broken",
      reason: "scrape failed",
    });
    expect(shouldRecheckSource("weebcentral", now + 2)).toBe(false);
  });

  it("allows recheck after the cooldown passes", async () => {
    const now = 2_000_000;

    await recordSourceFailure("mangabuddy", "proxy failed", now);
    await recordSourceFailure("mangabuddy", "proxy failed", now + 1);
    await syncSourceHealthFromStore();

    expect(shouldRecheckSource("mangabuddy", now + 1000 * 60 * 16)).toBe(true);
  });

  it("restores a source after a successful recovery", async () => {
    const now = 3_000_000;

    await recordSourceFailure("weebcentral", "scrape failed", now);
    await recordSourceFailure("weebcentral", "scrape failed", now + 1);
    await syncSourceHealthFromStore();
    await recordSourceSuccess("weebcentral");
    await syncSourceHealthFromStore();

    expect(getSourceAvailability("weebcentral")).toMatchObject({ status: "healthy" });
    expect(isSourceSearchable("weebcentral")).toBe(true);
  });
});
