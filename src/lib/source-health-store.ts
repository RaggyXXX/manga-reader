import type { MangaSource } from "./manga-store";
import type { SourceAvailabilityStatus } from "./source-health";

export interface SourceHealthRecord {
  source: MangaSource;
  status: Exclude<SourceAvailabilityStatus, "outdated">;
  reason?: string;
  failureCount: number;
  failedAt: number;
  lastCheckedAt: number;
  recheckAfter: number;
}

interface SourceHealthFileData {
  version: 1;
  records: Partial<Record<MangaSource, SourceHealthRecord>>;
}

let browserRecords: Partial<Record<MangaSource, SourceHealthRecord>> = {};
let writeQueue = Promise.resolve();

function isNodeRuntime() {
  return typeof window === "undefined" && typeof process !== "undefined" && Boolean(process.versions?.node);
}

async function getStoreFilePath() {
  const path = await import("node:path");
  return process.env.SOURCE_HEALTH_STORE_PATH || path.join(process.cwd(), ".app-data", "source-health.json");
}

async function ensureNodeStoreFile() {
  const [{ mkdir, readFile, writeFile }, path] = await Promise.all([
    import("node:fs/promises"),
    import("node:path"),
  ]);
  const filePath = await getStoreFilePath();
  await mkdir(path.dirname(filePath), { recursive: true });

  try {
    await readFile(filePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("ENOENT")) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== "ENOENT") throw error;
    }
    await writeFile(filePath, JSON.stringify({ version: 1, records: {} } satisfies SourceHealthFileData, null, 2), "utf8");
  }

  return filePath;
}

async function readNodeStore(): Promise<Partial<Record<MangaSource, SourceHealthRecord>>> {
  const { readFile } = await import("node:fs/promises");
  const filePath = await ensureNodeStoreFile();

  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<SourceHealthFileData> | null;
    if (!parsed || typeof parsed !== "object" || !parsed.records || typeof parsed.records !== "object") {
      return {};
    }
    return parsed.records as Partial<Record<MangaSource, SourceHealthRecord>>;
  } catch {
    return {};
  }
}

async function writeNodeStore(records: Partial<Record<MangaSource, SourceHealthRecord>>) {
  const { writeFile } = await import("node:fs/promises");
  const filePath = await ensureNodeStoreFile();
  const payload: SourceHealthFileData = {
    version: 1,
    records,
  };
  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}

async function readRecords() {
  if (!isNodeRuntime()) {
    return { ...browserRecords };
  }
  return readNodeStore();
}

async function writeRecords(records: Partial<Record<MangaSource, SourceHealthRecord>>) {
  if (!isNodeRuntime()) {
    browserRecords = { ...records };
    return;
  }

  writeQueue = writeQueue.then(() => writeNodeStore(records));
  await writeQueue;
}

export async function initSourceHealthStore(): Promise<void> {
  await readRecords();
}

export async function getSourceHealthSnapshot(): Promise<Partial<Record<MangaSource, SourceHealthRecord>>> {
  return readRecords();
}

export async function getSourceHealthRecord(source: MangaSource): Promise<SourceHealthRecord | null> {
  const records = await readRecords();
  return records[source] ?? null;
}

export async function saveSourceHealthRecord(record: SourceHealthRecord): Promise<void> {
  const records = await readRecords();
  records[record.source] = record;
  await writeRecords(records);
}

export async function deleteSourceHealthRecord(source: MangaSource): Promise<void> {
  const records = await readRecords();
  delete records[source];
  await writeRecords(records);
}

export async function clearSourceHealthStore(): Promise<void> {
  await writeRecords({});
}

export async function __resetSourceHealthStoreForTests() {
  browserRecords = {};
  writeQueue = Promise.resolve();

  if (!isNodeRuntime()) return;

  const { rm } = await import("node:fs/promises");
  const filePath = await getStoreFilePath();
  await rm(filePath, { force: true });
}
