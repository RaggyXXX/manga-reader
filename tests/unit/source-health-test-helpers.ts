import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { __resetSourceHealthStoreForTests } from "../../src/lib/source-health-store";

export async function useIsolatedSourceHealthStore(testName: string) {
  const dir = path.join(tmpdir(), "manga-blast-source-health-tests");
  await mkdir(dir, { recursive: true });
  process.env.SOURCE_HEALTH_STORE_PATH = path.join(dir, `${testName}.json`);
  await rm(process.env.SOURCE_HEALTH_STORE_PATH, { force: true });
  await __resetSourceHealthStoreForTests();
}
