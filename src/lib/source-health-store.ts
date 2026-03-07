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

let resolvedStorePath: string | null = null;

async function getStoreFilePath() {
  if (resolvedStorePath) return resolvedStorePath;
  const path = await import("node:path");
  if (process.env.SOURCE_HEALTH_STORE_PATH) {
    resolvedStorePath = process.env.SOURCE_HEALTH_STORE_PATH;
    return resolvedStorePath;
  }
  // Prefer cwd, fall back to /tmp for read-only filesystems (Netlify, Lambda)
  const candidates = [
    path.join(process.cwd(), ".app-data", "source-health.json"),
    path.join("/tmp", "source-health.json"),
  ];
  const { mkdir } = await import("node:fs/promises");
  for (const candidate of candidates) {
    try {
      await mkdir(path.dirname(candidate), { recursive: true });
      resolvedStorePath = candidate;
      return candidate;
    } catch {
      // directory not writable, try next
    }
  }
  // All failed — use in-memory only
  resolvedStorePath = "";
  return "";
}

async function ensureNodeStoreFile() {
  const filePath = await getStoreFilePath();
  if (!filePath) return ""; // in-memory only

  const { readFile, writeFile } = await import("node:fs/promises");

  try {
    await readFile(filePath, "utf8");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      try {
        await writeFile(filePath, JSON.stringify({ version: 1, records: {} } satisfies SourceHealthFileData, null, 2), "utf8");
      } catch {
        // read-only FS — degrade to in-memory
        return "";
      }
    }
  }

  return filePath;
}

async function readNodeStore(): Promise<Partial<Record<MangaSource, SourceHealthRecord>>> {
  const filePath = await ensureNodeStoreFile();
  if (!filePath) return {};

  try {
    const { readFile } = await import("node:fs/promises");
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
  const filePath = await ensureNodeStoreFile();
  if (!filePath) return;

  try {
    const { writeFile } = await import("node:fs/promises");
    const payload: SourceHealthFileData = {
      version: 1,
      records,
    };
    await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  } catch {
    // read-only FS — silently degrade
  }
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
  resolvedStorePath = null;

  if (!isNodeRuntime()) return;

  try {
    const { rm } = await import("node:fs/promises");
    const filePath = await getStoreFilePath();
    if (filePath) await rm(filePath, { force: true });
  } catch {
    // ignore
  }
}
