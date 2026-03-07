"use client";

import { dbStores, deleteRecord, ensureLegacyDataMigrated, getAllFromStore, putRecord, queueMicrotaskSafe } from "./db";

export interface Bookmark {
  id: string;
  slug: string;
  chapterNumber: number;
  imageIndex: number;
  note?: string;
  createdAt: number;
}

type AllBookmarks = Record<string, Bookmark[]>;

let bookmarksCache: AllBookmarks = {};
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

export async function initBookmarkStore(): Promise<void> {
  if (ready) return;
  if (!initPromise) {
    initPromise = (async () => {
      await ensureLegacyDataMigrated();
      const records = await getAllFromStore<Bookmark>(dbStores.bookmarks);
      const grouped: AllBookmarks = {};
      for (const bookmark of records) {
        if (!grouped[bookmark.slug]) grouped[bookmark.slug] = [];
        grouped[bookmark.slug].push(bookmark);
      }
      for (const slug of Object.keys(grouped)) {
        grouped[slug].sort((a, b) => b.createdAt - a.createdAt);
      }
      bookmarksCache = grouped;
      ready = true;
    })();
  }

  await initPromise;
}

export function __resetBookmarkStoreForTests() {
  bookmarksCache = {};
  ready = false;
  initPromise = null;
  writeQueue = Promise.resolve();
}

export function getBookmarks(slug: string): Bookmark[] {
  return [...(bookmarksCache[slug] ?? [])];
}

export function getAllBookmarks(): AllBookmarks {
  return Object.fromEntries(Object.entries(bookmarksCache).map(([slug, bookmarks]) => [slug, [...bookmarks]]));
}

export function addBookmark(
  slug: string,
  chapterNumber: number,
  imageIndex: number,
  note?: string,
): Bookmark {
  const bookmark: Bookmark = {
    id: crypto.randomUUID(),
    slug,
    chapterNumber,
    imageIndex,
    note,
    createdAt: Date.now(),
  };
  if (!bookmarksCache[slug]) bookmarksCache[slug] = [];
  bookmarksCache[slug].push(bookmark);
  bookmarksCache[slug].sort((a, b) => b.createdAt - a.createdAt);
  enqueueWrite(() => putRecord(dbStores.bookmarks, bookmark));
  emitStorageUpdate();
  return bookmark;
}

export function removeBookmark(slug: string, id: string) {
  const current = bookmarksCache[slug];
  if (!current) return;
  bookmarksCache[slug] = current.filter((bookmark) => bookmark.id !== id);
  if (bookmarksCache[slug].length === 0) delete bookmarksCache[slug];
  enqueueWrite(() => deleteRecord(dbStores.bookmarks, id));
  emitStorageUpdate();
}

export function getChapterBookmarks(slug: string, chapterNumber: number): Bookmark[] {
  return getBookmarks(slug).filter((bookmark) => bookmark.chapterNumber === chapterNumber);
}

export function hasBookmark(slug: string, chapterNumber: number, imageIndex: number): boolean {
  return getBookmarks(slug).some(
    (bookmark) => bookmark.chapterNumber === chapterNumber && bookmark.imageIndex === imageIndex,
  );
}
