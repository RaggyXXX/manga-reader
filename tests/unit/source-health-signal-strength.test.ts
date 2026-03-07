import { beforeEach, describe, expect, it } from "vitest";
import { collectSearchResults } from "../../src/lib/search-aggregation";
import {
  getSourceAvailability,
  recordSourceFailure,
  recordSourceSuccess,
  resetSourceHealthForTests,
  syncSourceHealthFromStore,
} from "../../src/lib/source-health";
import { initSourceHealthStore } from "../../src/lib/source-health-store";
import { useIsolatedSourceHealthStore } from "./source-health-test-helpers";

beforeEach(async () => {
  await useIsolatedSourceHealthStore("source-health-signal-strength");
  resetSourceHealthForTests();
  await initSourceHealthStore();
});

describe("source-health signal strength", () => {
  it("does not mark a source broken from repeated search failures alone", async () => {
    await collectSearchResults("test", [
      { name: "weebcentral", fn: async () => { throw new Error("Timeout"); } },
    ]);
    await collectSearchResults("test", [
      { name: "weebcentral", fn: async () => { throw new Error("Timeout"); } },
    ]);
    await syncSourceHealthFromStore();

    expect(getSourceAvailability("weebcentral").status).toBe("healthy");
  });

  it("marks a source broken from repeated strong failures", async () => {
    const now = 1_000_000;

    await recordSourceFailure("weebcentral", "chapter images failing", now, "strong");
    await recordSourceFailure("weebcentral", "chapter images failing", now + 1, "strong");
    await syncSourceHealthFromStore();

    expect(getSourceAvailability("weebcentral")).toMatchObject({ status: "broken" });
  });

  it("restores a source after a successful strong-path recovery", async () => {
    const now = 2_000_000;

    await recordSourceFailure("mangabuddy", "proxy failed", now, "strong");
    await recordSourceFailure("mangabuddy", "proxy failed", now + 1, "strong");
    await syncSourceHealthFromStore();
    await recordSourceSuccess("mangabuddy");
    await syncSourceHealthFromStore();

    expect(getSourceAvailability("mangabuddy").status).toBe("healthy");
  });
});
