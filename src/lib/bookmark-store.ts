const BOOKMARKS_KEY = "manga-bookmarks";

export interface Bookmark {
  id: string;
  slug: string;
  chapterNumber: number;
  imageIndex: number;
  note?: string;
  createdAt: number;
}

type AllBookmarks = Record<string, Bookmark[]>;

function loadAll(): AllBookmarks {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAll(data: AllBookmarks) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable
  }
}

export function getBookmarks(slug: string): Bookmark[] {
  const all = loadAll();
  return all[slug] ?? [];
}

export function getAllBookmarks(): AllBookmarks {
  return loadAll();
}

export function addBookmark(
  slug: string,
  chapterNumber: number,
  imageIndex: number,
  note?: string
): Bookmark {
  const all = loadAll();
  const bookmark: Bookmark = {
    id: crypto.randomUUID(),
    slug,
    chapterNumber,
    imageIndex,
    note,
    createdAt: Date.now(),
  };
  if (!all[slug]) {
    all[slug] = [];
  }
  all[slug].push(bookmark);
  saveAll(all);
  return bookmark;
}

export function removeBookmark(slug: string, id: string) {
  const all = loadAll();
  if (!all[slug]) return;
  all[slug] = all[slug].filter((b) => b.id !== id);
  if (all[slug].length === 0) {
    delete all[slug];
  }
  saveAll(all);
}

export function getChapterBookmarks(
  slug: string,
  chapterNumber: number
): Bookmark[] {
  const bookmarks = getBookmarks(slug);
  return bookmarks.filter((b) => b.chapterNumber === chapterNumber);
}

export function hasBookmark(
  slug: string,
  chapterNumber: number,
  imageIndex: number
): boolean {
  const bookmarks = getBookmarks(slug);
  return bookmarks.some(
    (b) => b.chapterNumber === chapterNumber && b.imageIndex === imageIndex
  );
}
