import type { MangaSource } from "./manga-store";
import { deleteSourceHealthRecord, getSourceHealthRecord, getSourceHealthSnapshot, initSourceHealthStore, saveSourceHealthRecord, type SourceHealthRecord } from "./source-health-store";

export type SourceAvailabilityStatus = "healthy" | "broken" | "outdated";
export type SourceFailureSignal = "weak" | "strong";
export type SourceNoticeTone = "warning" | "muted";

export interface SourceAvailability {
  source: MangaSource;
  status: SourceAvailabilityStatus;
  reason?: string;
  until?: number;
}

export interface SourceNotice {
  tone: SourceNoticeTone;
  title: string;
  message: string;
}

export const ALL_SOURCES: MangaSource[] = [
  "mangadex",
  "mangakatana",
  "manhwazone",
  "weebcentral",
  "atsumaru",
  "mangabuddy",
];

export const BROKEN_SOURCE_TTL_MS = 1000 * 60 * 15;
export const SOURCE_FAILURE_THRESHOLD = 2;

const HOST_SOURCE_MAP: Array<{ match: (hostname: string) => boolean; source: MangaSource }> = [
  { source: "mangadex", match: (hostname) => hostname === "mangadex.org" || hostname === "uploads.mangadex.org" },
  { source: "mangakatana", match: (hostname) => hostname === "mangakatana.com" || hostname.endsWith(".mangakatana.com") },
  { source: "manhwazone", match: (hostname) => ["manhwazone.to", "media.manhwazone.to", "official.lowee.us", "hot.planeptune.us", "c2.manhwatop.com", "c4.manhwatop.com"].includes(hostname) },
  { source: "weebcentral", match: (hostname) => hostname === "weebcentral.com" || hostname.endsWith(".weebcentral.com") || hostname === "temp.compsci88.com" },
  { source: "atsumaru", match: (hostname) => hostname === "atsu.moe" },
  { source: "mangabuddy", match: (hostname) => hostname === "mangabuddy.com" || hostname.endsWith(".mangabuddy.com") || hostname === "res.mbbcdn.com" },
];

export function inferSourceFromUrl(rawUrl: string): MangaSource | null {
  try {
    const hostname = new URL(rawUrl).hostname;
    return HOST_SOURCE_MAP.find((entry) => entry.match(hostname))?.source ?? null;
  } catch {
    return null;
  }
}

const DEFAULT_OUTDATED_SOURCES: MangaSource[] = [];

const brokenSources = new Map<MangaSource, SourceHealthRecord>();
const sourceFailureCounts = new Map<MangaSource, { count: number; reason?: string }>();
let outdatedSources = new Set<MangaSource>(DEFAULT_OUTDATED_SOURCES);

export async function syncSourceHealthFromStore() {
  await initSourceHealthStore();
  const snapshot = await getSourceHealthSnapshot();
  brokenSources.clear();
  for (const [source, record] of Object.entries(snapshot)) {
    if (record?.status === "broken") {
      brokenSources.set(source as MangaSource, record);
    }
  }
}

export function getSourceAvailability(source: MangaSource): SourceAvailability {
  if (outdatedSources.has(source)) {
    return { source, status: "outdated" };
  }

  const broken = brokenSources.get(source);
  if (broken) {
    return {
      source,
      status: "broken",
      reason: broken.reason,
      until: broken.recheckAfter,
    };
  }

  return { source, status: "healthy" };
}

export function isSourceSearchable(source: MangaSource) {
  return getSourceAvailability(source).status === "healthy";
}

export function isSourceSyncable(source: MangaSource) {
  return getSourceAvailability(source).status === "healthy";
}

export function getSourceNoticeFromAvailability(availability: Pick<SourceAvailability, "status">): SourceNotice | null {
  if (availability.status === "broken") {
    return {
      tone: "warning",
      title: "Source temporarily unavailable",
      message: "Updates are currently unavailable. Saved chapters stay readable.",
    };
  }

  if (availability.status === "outdated") {
    return {
      tone: "muted",
      title: "Source retired",
      message: "This source no longer provides new updates. Saved chapters stay readable.",
    };
  }

  return null;
}

export function getSourceNotice(source: MangaSource): SourceNotice | null {
  return getSourceNoticeFromAvailability(getSourceAvailability(source));
}

export async function markSourceBroken(source: MangaSource, reason?: string, now = Date.now()) {
  const record: SourceHealthRecord = {
    source,
    status: "broken",
    reason,
    failureCount: Math.max(sourceFailureCounts.get(source)?.count || 0, SOURCE_FAILURE_THRESHOLD),
    failedAt: now,
    lastCheckedAt: now,
    recheckAfter: now + BROKEN_SOURCE_TTL_MS,
  };
  brokenSources.set(source, record);
  await saveSourceHealthRecord(record);
}

export async function recordSourceFailure(source: MangaSource, reason?: string, now = Date.now(), signal: SourceFailureSignal = "strong") {
  const persisted = await getSourceHealthRecord(source);
  if (signal === "weak") {
    sourceFailureCounts.set(source, { count: 0, reason });
    return;
  }

  const current = sourceFailureCounts.get(source);
  const nextCount = Math.max(current?.count || 0, persisted?.failureCount || 0) + 1;
  sourceFailureCounts.set(source, { count: nextCount, reason });

  if (nextCount >= SOURCE_FAILURE_THRESHOLD) {
    await markSourceBroken(source, reason, now);
  }
}

export async function recordSourceSuccess(source: MangaSource) {
  sourceFailureCounts.delete(source);
  clearSourceBroken(source);
  await deleteSourceHealthRecord(source);
}

export function clearSourceBroken(source: MangaSource) {
  brokenSources.delete(source);
}

export function shouldRecheckSource(source: MangaSource, now = Date.now()) {
  const availability = getSourceAvailability(source);
  if (availability.status !== "broken") return false;
  return (availability.until || 0) <= now;
}

export function listSearchableSources(): MangaSource[] {
  return ALL_SOURCES.filter((source) => isSourceSearchable(source));
}

export function getAllSourceAvailability(): Record<MangaSource, SourceAvailability> {
  return Object.fromEntries(
    ALL_SOURCES.map((source) => [source, getSourceAvailability(source)]),
  ) as Record<MangaSource, SourceAvailability>;
}

export function setOutdatedSources(sources: MangaSource[]) {
  outdatedSources = new Set(sources);
}

export function clearAllBrokenSources() {
  brokenSources.clear();
  sourceFailureCounts.clear();
}

export function hydrateSourceHealthSnapshot(
  snapshot: Partial<Record<MangaSource, Pick<SourceAvailability, "status" | "reason" | "until">>>,
) {
  outdatedSources = new Set(
    Object.entries(snapshot)
      .filter(([, availability]) => availability?.status === "outdated")
      .map(([source]) => source as MangaSource),
  );

  clearAllBrokenSources();

  for (const [source, availability] of Object.entries(snapshot)) {
    if (availability?.status === "broken") {
      brokenSources.set(source as MangaSource, {
        source: source as MangaSource,
        status: "broken",
        reason: availability.reason,
        failureCount: SOURCE_FAILURE_THRESHOLD,
        failedAt: 0,
        lastCheckedAt: 0,
        recheckAfter: availability.until ?? Date.now() + BROKEN_SOURCE_TTL_MS,
      });
    }
  }
}

export function setOutdatedSourcesForTests(sources: MangaSource[]) {
  setOutdatedSources(sources);
}

export function resetSourceHealthForTests() {
  clearAllBrokenSources();
  outdatedSources = new Set(DEFAULT_OUTDATED_SOURCES);
}
