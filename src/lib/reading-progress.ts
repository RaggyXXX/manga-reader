const STORAGE_KEY = "manga-reader-progress";

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

function loadAll(): AllProgress {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAll(data: AllProgress) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable
  }
}

export function getProgress(slug: string): SeriesProgress | null {
  const all = loadAll();
  return all[slug] ?? null;
}

export function getReadChapters(slug: string): number[] {
  return getProgress(slug)?.readChapters ?? [];
}

export function getLastReadChapter(slug: string): number | null {
  return getProgress(slug)?.lastReadChapter ?? null;
}

export function markChapterRead(slug: string, chapter: number) {
  const all = loadAll();
  if (!all[slug]) {
    all[slug] = { lastReadChapter: chapter, readChapters: [chapter], chapterProgress: {} };
  } else {
    if (!all[slug].readChapters.includes(chapter)) {
      all[slug].readChapters.push(chapter);
    }
    all[slug].lastReadChapter = chapter;
  }
  saveAll(all);
}

export function saveScrollPosition(slug: string, chapter: number, position: ChapterPosition) {
  const all = loadAll();
  if (!all[slug]) {
    all[slug] = { lastReadChapter: chapter, readChapters: [], chapterProgress: {} };
  }
  all[slug].chapterProgress[chapter] = position;
  saveAll(all);
}

export function getScrollPosition(slug: string, chapter: number): ChapterPosition | null {
  const progress = getProgress(slug);
  return progress?.chapterProgress[chapter] ?? null;
}

export function markAllChaptersRead(slug: string, chapterNumbers: number[]) {
  const all = loadAll();
  const last = chapterNumbers.length > 0 ? Math.max(...chapterNumbers) : 0;
  if (!all[slug]) {
    all[slug] = { lastReadChapter: last, readChapters: [...chapterNumbers], chapterProgress: {} };
  } else {
    const merged = new Set([...all[slug].readChapters, ...chapterNumbers]);
    all[slug].readChapters = Array.from(merged);
    all[slug].lastReadChapter = last;
  }
  saveAll(all);
}

export function clearSeriesProgress(slug: string) {
  const all = loadAll();
  delete all[slug];
  saveAll(all);
}

/* ── Reading statistics ─────────────────────────────── */

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
  const all = loadAll();

  let totalChaptersRead = 0;
  let totalPagesViewed = 0;

  const seriesStats: ReadingStats["seriesStats"] = [];

  for (const [slug, progress] of Object.entries(all)) {
    const chaptersRead = progress.readChapters.length;
    totalChaptersRead += chaptersRead;

    // Sum up all imageIndex values from chapterProgress entries (approximate page count)
    let lastReadAt = 0;
    for (const pos of Object.values(progress.chapterProgress)) {
      totalPagesViewed += pos.imageIndex + 1; // imageIndex is 0-based
      if (pos.timestamp > lastReadAt) {
        lastReadAt = pos.timestamp;
      }
    }

    seriesStats.push({
      slug,
      chaptersRead,
      lastReadChapter: progress.lastReadChapter,
      lastReadAt,
    });
  }

  // Sort by most recently read first
  seriesStats.sort((a, b) => b.lastReadAt - a.lastReadAt);

  // Estimate reading time: ~30 seconds per page
  const estimatedMinutes = Math.round(totalPagesViewed * 0.5);

  return {
    totalChaptersRead,
    totalPagesViewed,
    estimatedMinutes,
    seriesStats,
  };
}
