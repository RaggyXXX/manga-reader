"use client";

import {
  dbStores,
  deleteRecord,
  ensureLegacyDataMigrated,
  getAllFromStore,
  putRecord,
  queueMicrotaskSafe,
} from "./db";

export type MangaSource =
  | "manhwazone"
  | "mangadex"
  | "mangakatana"
  | "weebcentral"
  | "atsumaru"
  | "mangabuddy";
export type ReadingStatus = "reading" | "plan_to_read" | "completed" | "on_hold" | "dropped";

export interface StoredSeries {
  slug: string;
  title: string;
  coverUrl: string;
  sourceUrl: string;
  totalChapters: number;
  addedAt: number;
  source?: MangaSource;
  sourceId?: string;
  preferredLanguage?: string;
  isFavorite?: boolean;
  readingStatus?: ReadingStatus;
}

export interface StoredChapter {
  slug?: string;
  number: number;
  title: string;
  url: string;
  imageUrls: string[];
  syncedAt: number | null;
}

type SeriesMap = Record<string, StoredSeries>;
type ChaptersMap = Record<string, Record<number, StoredChapter>>;

let seriesCache: SeriesMap = {};
let chaptersCache: ChaptersMap = {};
let ready = false;
let initPromise: Promise<void> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

const LIBRARY_PREFS_KEY = "manga-library-prefs";

export type SortOption = "last_read" | "recently_added" | "alphabetical" | "chapter_count";

export interface LibraryPrefs {
  sortBy: SortOption;
  filterStatus?: ReadingStatus;
  filterSource?: MangaSource;
  filterFavoritesOnly?: boolean;
  viewMode?: "grid" | "list";
}

function loadJson<T>(key: string, fallback: T): T {
  if (typeof globalThis === "undefined" || typeof globalThis.localStorage === "undefined") {
    return fallback;
  }
  try {
    const raw = globalThis.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, data: unknown) {
  if (typeof globalThis === "undefined" || typeof globalThis.localStorage === "undefined") {
    return;
  }
  try {
    globalThis.localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // ignore small prefs persistence failures
  }
}

function enqueueWrite(operation: () => Promise<void>) {
  writeQueue = writeQueue.then(operation).catch(() => {});
}

function normalizeChapterRecord(record: StoredChapter): StoredChapter {
  return {
    number: record.number,
    title: record.title,
    url: record.url,
    imageUrls: Array.isArray(record.imageUrls) ? record.imageUrls : [],
    syncedAt: record.syncedAt ?? null,
  };
}

function emitStorageUpdate() {
  if (typeof window === "undefined") return;
  queueMicrotaskSafe(() => {
    window.dispatchEvent(new Event("storage-updated"));
  });
}

export async function initMangaStore(): Promise<void> {
  if (ready) return;
  if (!initPromise) {
    initPromise = (async () => {
      await ensureLegacyDataMigrated();
      const [seriesRecords, chapterRecords] = await Promise.all([
        getAllFromStore<StoredSeries>(dbStores.series),
        getAllFromStore<(StoredChapter & { slug: string })>(dbStores.chapters),
      ]);

      const nextSeries: SeriesMap = {};
      for (const series of seriesRecords) {
        nextSeries[series.slug] = series;
      }

      const nextChapters: ChaptersMap = {};
      for (const chapter of chapterRecords) {
        if (!nextChapters[chapter.slug]) nextChapters[chapter.slug] = {};
        nextChapters[chapter.slug][chapter.number] = normalizeChapterRecord(chapter);
      }

      seriesCache = nextSeries;
      chaptersCache = nextChapters;
      ready = true;
    })();
  }

  await initPromise;
}

export function isMangaStoreReady() {
  return ready;
}

export function __resetMangaStoreForTests() {
  seriesCache = {};
  chaptersCache = {};
  ready = false;
  initPromise = null;
  writeQueue = Promise.resolve();
}

export function getAllSeries(): StoredSeries[] {
  return Object.values(seriesCache).sort((a, b) => b.addedAt - a.addedAt);
}

export function getSeries(slug: string): StoredSeries | null {
  return seriesCache[slug] ?? null;
}

export function saveSeries(series: StoredSeries) {
  seriesCache[series.slug] = series;
  enqueueWrite(() => putRecord(dbStores.series, series));
  emitStorageUpdate();
}

export function deleteSeries(slug: string) {
  const chapterNumbers = Object.keys(chaptersCache[slug] ?? {}).map((num) => Number(num));
  delete seriesCache[slug];
  delete chaptersCache[slug];
  enqueueWrite(async () => {
    await deleteRecord(dbStores.series, slug);
    await Promise.all(chapterNumbers.map((num) => deleteRecord(dbStores.chapters, [slug, num])));
  });
  emitStorageUpdate();
}

export function updateSeriesTotalChapters(slug: string, total: number) {
  const series = seriesCache[slug];
  if (!series) return;
  const updated = { ...series, totalChapters: total };
  seriesCache[slug] = updated;
  enqueueWrite(() => putRecord(dbStores.series, updated));
  emitStorageUpdate();
}

export function getChapters(slug: string): StoredChapter[] {
  return Object.values(chaptersCache[slug] ?? {})
    .map((chapter) => normalizeChapterRecord(chapter))
    .sort((a, b) => a.number - b.number);
}

export function getChapter(slug: string, num: number): StoredChapter | null {
  const chapter = chaptersCache[slug]?.[num];
  return chapter ? normalizeChapterRecord(chapter) : null;
}

export function saveChapter(slug: string, chapter: StoredChapter) {
  if (!chaptersCache[slug]) chaptersCache[slug] = {};
  const normalized = normalizeChapterRecord(chapter);
  chaptersCache[slug][chapter.number] = normalized;
  enqueueWrite(() => putRecord(dbStores.chapters, { slug, ...normalized }));
  emitStorageUpdate();
}

export function saveChapters(slug: string, chapters: StoredChapter[]) {
  if (!chaptersCache[slug]) chaptersCache[slug] = {};
  for (const chapter of chapters) {
    chaptersCache[slug][chapter.number] = normalizeChapterRecord(chapter);
  }
  enqueueWrite(async () => {
    await Promise.all(
      chapters.map((chapter) => putRecord(dbStores.chapters, { slug, ...normalizeChapterRecord(chapter) })),
    );
  });
  emitStorageUpdate();
}

export function getSyncedChapterCount(slug: string): number {
  return getChapters(slug).filter((ch) => ch.imageUrls.length > 0).length;
}

export function getUnsyncedChapters(slug: string): StoredChapter[] {
  return getChapters(slug).filter((ch) => ch.imageUrls.length === 0);
}

export function toggleFavorite(slug: string): boolean {
  const series = seriesCache[slug];
  if (!series) return false;
  const updated = { ...series, isFavorite: !series.isFavorite };
  seriesCache[slug] = updated;
  enqueueWrite(() => putRecord(dbStores.series, updated));
  emitStorageUpdate();
  return !!updated.isFavorite;
}

export function updateReadingStatus(slug: string, status: ReadingStatus | undefined) {
  const series = seriesCache[slug];
  if (!series) return;
  const updated = { ...series };
  if (status) updated.readingStatus = status;
  else delete updated.readingStatus;
  seriesCache[slug] = updated;
  enqueueWrite(() => putRecord(dbStores.series, updated));
  emitStorageUpdate();
}

export function getLibraryPrefs(): LibraryPrefs {
  return loadJson<LibraryPrefs>(LIBRARY_PREFS_KEY, { sortBy: "recently_added" });
}

export function saveLibraryPrefs(prefs: LibraryPrefs) {
  saveJson(LIBRARY_PREFS_KEY, prefs);
}
