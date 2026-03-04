const SERIES_KEY = "manga-series";
const CHAPTERS_KEY = "manga-chapters";

export type MangaSource = "manhwazone" | "mangadex" | "mangakatana" | "vymanga";
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
  number: number;
  title: string;
  url: string;
  imageUrls: string[];
  syncedAt: number | null;
}

type SeriesMap = Record<string, StoredSeries>;
type ChaptersMap = Record<string, Record<number, StoredChapter>>;

function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, data: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // localStorage full
  }
}

// --- Series ---

export function getAllSeries(): StoredSeries[] {
  const map = loadJson<SeriesMap>(SERIES_KEY, {});
  return Object.values(map).sort((a, b) => b.addedAt - a.addedAt);
}

export function getSeries(slug: string): StoredSeries | null {
  const map = loadJson<SeriesMap>(SERIES_KEY, {});
  return map[slug] ?? null;
}

export function saveSeries(series: StoredSeries) {
  const map = loadJson<SeriesMap>(SERIES_KEY, {});
  map[series.slug] = series;
  saveJson(SERIES_KEY, map);
}

export function deleteSeries(slug: string) {
  const map = loadJson<SeriesMap>(SERIES_KEY, {});
  delete map[slug];
  saveJson(SERIES_KEY, map);

  const chapters = loadJson<ChaptersMap>(CHAPTERS_KEY, {});
  delete chapters[slug];
  saveJson(CHAPTERS_KEY, chapters);
}

export function updateSeriesTotalChapters(slug: string, total: number) {
  const map = loadJson<SeriesMap>(SERIES_KEY, {});
  if (map[slug]) {
    map[slug].totalChapters = total;
    saveJson(SERIES_KEY, map);
  }
}

// --- Chapters ---

export function getChapters(slug: string): StoredChapter[] {
  const map = loadJson<ChaptersMap>(CHAPTERS_KEY, {});
  const chapterMap = map[slug] ?? {};
  return Object.values(chapterMap).sort((a, b) => a.number - b.number);
}

export function getChapter(slug: string, num: number): StoredChapter | null {
  const map = loadJson<ChaptersMap>(CHAPTERS_KEY, {});
  return map[slug]?.[num] ?? null;
}

export function saveChapter(slug: string, chapter: StoredChapter) {
  const map = loadJson<ChaptersMap>(CHAPTERS_KEY, {});
  if (!map[slug]) map[slug] = {};
  map[slug][chapter.number] = chapter;
  saveJson(CHAPTERS_KEY, map);
}

export function saveChapters(slug: string, chapters: StoredChapter[]) {
  const map = loadJson<ChaptersMap>(CHAPTERS_KEY, {});
  if (!map[slug]) map[slug] = {};
  for (const ch of chapters) {
    map[slug][ch.number] = ch;
  }
  saveJson(CHAPTERS_KEY, map);
}

export function getSyncedChapterCount(slug: string): number {
  const chapters = getChapters(slug);
  return chapters.filter((ch) => ch.imageUrls.length > 0).length;
}

export function getUnsyncedChapters(slug: string): StoredChapter[] {
  return getChapters(slug).filter((ch) => ch.imageUrls.length === 0);
}

// --- Favorites & Status ---

export function toggleFavorite(slug: string): boolean {
  const map = loadJson<SeriesMap>(SERIES_KEY, {});
  if (!map[slug]) return false;
  map[slug].isFavorite = !map[slug].isFavorite;
  saveJson(SERIES_KEY, map);
  return !!map[slug].isFavorite;
}

export function updateReadingStatus(slug: string, status: ReadingStatus | undefined) {
  const map = loadJson<SeriesMap>(SERIES_KEY, {});
  if (!map[slug]) return;
  if (status) {
    map[slug].readingStatus = status;
  } else {
    delete map[slug].readingStatus;
  }
  saveJson(SERIES_KEY, map);
}

// --- Library Preferences ---

const LIBRARY_PREFS_KEY = "manga-library-prefs";

export type SortOption = "last_read" | "recently_added" | "alphabetical" | "chapter_count";

export interface LibraryPrefs {
  sortBy: SortOption;
  filterStatus?: ReadingStatus;
  filterSource?: MangaSource;
  filterFavoritesOnly?: boolean;
  viewMode?: "grid" | "list";
}

export function getLibraryPrefs(): LibraryPrefs {
  return loadJson<LibraryPrefs>(LIBRARY_PREFS_KEY, { sortBy: "recently_added" });
}

export function saveLibraryPrefs(prefs: LibraryPrefs) {
  saveJson(LIBRARY_PREFS_KEY, prefs);
}
