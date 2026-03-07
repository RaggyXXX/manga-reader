"use client";

import { dbStores, deleteRecord, ensureLegacyDataMigrated, getAllFromStore, putRecord, queueMicrotaskSafe } from "./db";

export interface ChapterPosition {
  scrollPercent: number;
  imageIndex: number;
  timestamp: number;
}

export interface SeriesProgress {
  lastReadChapter: number;
  readChapters: number[];
  chapterProgress: Record<number, ChapterPosition>;
}

type AllProgress = Record<string, SeriesProgress>;

let progressCache: AllProgress = {};
let ready = false;
let initPromise: Promise<void> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function enqueueWrite(operation: () => Promise<void>) {
  writeQueue = writeQueue.then(operation).catch(() => {});
}

function emitStorageUpdate() {
  if (typeof window === "undefined") return;
  queueMicrotaskSafe(() => {
    window.dispatchEvent(new Event("storage-updated"));
  });
}

function cloneProgress(progress: SeriesProgress): SeriesProgress {
  return {
    lastReadChapter: progress.lastReadChapter,
    readChapters: [...progress.readChapters],
    chapterProgress: { ...progress.chapterProgress },
  };
}

function persistProgress(slug: string) {
  const progress = progressCache[slug];
  if (!progress) {
    enqueueWrite(() => deleteRecord(dbStores.readingProgress, slug));
    return;
  }
  enqueueWrite(() => putRecord(dbStores.readingProgress, { slug, ...cloneProgress(progress) }));
}

export async function initReadingProgressStore(): Promise<void> {
  if (ready) return;
  if (!initPromise) {
    initPromise = (async () => {
      await ensureLegacyDataMigrated();
      const records = await getAllFromStore<(SeriesProgress & { slug: string })>(dbStores.readingProgress);
      const next: AllProgress = {};
      for (const record of records) {
        const { slug, ...progress } = record;
        next[slug] = cloneProgress(progress);
      }
      progressCache = next;
      ready = true;
    })();
  }
  await initPromise;
}

export function __resetReadingProgressStoreForTests() {
  progressCache = {};
  ready = false;
  initPromise = null;
  writeQueue = Promise.resolve();
}

export function getProgress(slug: string): SeriesProgress | null {
  const progress = progressCache[slug];
  return progress ? cloneProgress(progress) : null;
}

export function getReadChapters(slug: string): number[] {
  return getProgress(slug)?.readChapters ?? [];
}

export function getLastReadChapter(slug: string): number | null {
  return getProgress(slug)?.lastReadChapter ?? null;
}

export function markChapterRead(slug: string, chapter: number) {
  const progress = progressCache[slug] ?? { lastReadChapter: chapter, readChapters: [], chapterProgress: {} };
  if (!progress.readChapters.includes(chapter)) {
    progress.readChapters.push(chapter);
  }
  progress.lastReadChapter = chapter;
  progressCache[slug] = progress;
  persistProgress(slug);
  emitStorageUpdate();
}

export function saveScrollPosition(slug: string, chapter: number, position: ChapterPosition) {
  const progress = progressCache[slug] ?? { lastReadChapter: chapter, readChapters: [], chapterProgress: {} };
  progress.chapterProgress[chapter] = position;
  progress.lastReadChapter = chapter;
  progressCache[slug] = progress;
  persistProgress(slug);
}

export function getScrollPosition(slug: string, chapter: number): ChapterPosition | null {
  return getProgress(slug)?.chapterProgress[chapter] ?? null;
}

export function markAllChaptersRead(slug: string, chapterNumbers: number[]) {
  const last = chapterNumbers.length > 0 ? Math.max(...chapterNumbers) : 0;
  const progress = progressCache[slug] ?? { lastReadChapter: last, readChapters: [], chapterProgress: {} };
  progress.readChapters = Array.from(new Set([...progress.readChapters, ...chapterNumbers]));
  progress.lastReadChapter = last;
  progressCache[slug] = progress;
  persistProgress(slug);
  emitStorageUpdate();
}

export function clearSeriesProgress(slug: string) {
  delete progressCache[slug];
  persistProgress(slug);
  emitStorageUpdate();
}

export interface ReadingStats {
  totalChaptersRead: number;
  totalPagesViewed: number;
  estimatedMinutes: number;
  seriesStats: Array<{
    slug: string;
    chaptersRead: number;
    lastReadChapter: number;
    lastReadAt: number;
  }>;
}

export function getReadingStats(): ReadingStats {
  const all = progressCache;
  let totalChaptersRead = 0;
  let totalPagesViewed = 0;
  const seriesStats: ReadingStats["seriesStats"] = [];

  for (const [slug, progress] of Object.entries(all)) {
    const chaptersRead = progress.readChapters.length;
    totalChaptersRead += chaptersRead;

    let lastReadAt = 0;
    for (const pos of Object.values(progress.chapterProgress)) {
      totalPagesViewed += pos.imageIndex + 1;
      if (pos.timestamp > lastReadAt) lastReadAt = pos.timestamp;
    }

    seriesStats.push({
      slug,
      chaptersRead,
      lastReadChapter: progress.lastReadChapter,
      lastReadAt,
    });
  }

  seriesStats.sort((a, b) => b.lastReadAt - a.lastReadAt);

  return {
    totalChaptersRead,
    totalPagesViewed,
    estimatedMinutes: Math.round(totalPagesViewed * 0.5),
    seriesStats,
  };
}
