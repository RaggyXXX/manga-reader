import { beforeEach, describe, expect, it } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
import { deleteMangaDatabase } from "../../src/lib/db";
import {
  __resetBookmarkStoreForTests,
  addBookmark,
  getAllBookmarks,
  getBookmarks,
  hasBookmark,
  initBookmarkStore,
  removeBookmark,
} from "../../src/lib/bookmark-store";
import {
  __resetReadingProgressStoreForTests,
  clearSeriesProgress,
  getLastReadChapter,
  getReadingStats,
  getScrollPosition,
  initReadingProgressStore,
  markAllChaptersRead,
  markChapterRead,
  saveScrollPosition,
} from "../../src/lib/reading-progress";
import {
  __resetFolderStoreForTests,
  createFolder,
  getFolderTree,
  initFolderStore,
  moveToFolder,
  syncWithSeries,
} from "../../src/lib/folder-store";
import {
  __resetUpdateFlagStoreForTests,
  clearUpdateFlagValue,
  getUpdateFlags,
  initUpdateFlagStore,
  setUpdateFlag,
} from "../../src/lib/update-flag-store";

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null; }
  key(index: number) { return Array.from(this.map.keys())[index] ?? null; }
  removeItem(key: string) { this.map.delete(key); }
  setItem(key: string, value: string) { this.map.set(key, value); }
}

beforeEach(async () => {
  Object.defineProperty(globalThis, "indexedDB", { value: fakeIndexedDB, configurable: true, writable: true });
  Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true, writable: true });
  __resetBookmarkStoreForTests();
  __resetReadingProgressStoreForTests();
  __resetFolderStoreForTests();
  __resetUpdateFlagStoreForTests();
  await deleteMangaDatabase();
  await Promise.all([initBookmarkStore(), initReadingProgressStore(), initFolderStore(), initUpdateFlagStore()]);
});

describe("secondary stores", () => {
  it("persists bookmarks in the cache facade", () => {
    const bookmark = addBookmark("one-piece", 1, 2, "note");
    expect(hasBookmark("one-piece", 1, 2)).toBe(true);
    expect(getBookmarks("one-piece")).toHaveLength(1);
    removeBookmark("one-piece", bookmark.id);
    expect(getAllBookmarks()).toEqual({});
  });

  it("tracks reading progress and stats", () => {
    markChapterRead("one-piece", 3);
    saveScrollPosition("one-piece", 3, { scrollPercent: 40, imageIndex: 4, timestamp: 123 });
    markAllChaptersRead("one-piece", [1, 2, 3]);
    expect(getLastReadChapter("one-piece")).toBe(3);
    expect(getScrollPosition("one-piece", 3)).toMatchObject({ imageIndex: 4 });
    expect(getReadingStats()).toMatchObject({ totalChaptersRead: 3 });
    clearSeriesProgress("one-piece");
    expect(getLastReadChapter("one-piece")).toBeNull();
  });

  it("maintains folder tree structure", () => {
    const folder = createFolder("Shonen");
    let tree = syncWithSeries(["one-piece", "naruto"]);
    expect(tree.rootOrder).toEqual(expect.arrayContaining([folder.id, "one-piece", "naruto"]));
    moveToFolder("one-piece", folder.id);
    tree = getFolderTree();
    expect(tree.folders[folder.id].children).toContain("one-piece");
  });

  it("stores update flags outside localStorage", () => {
    setUpdateFlag("one-piece", { newCount: 3, checkedAt: 123 });
    expect(getUpdateFlags()).toMatchObject({ "one-piece": { newCount: 3, checkedAt: 123 } });
    clearUpdateFlagValue("one-piece");
    expect(getUpdateFlags()).toMatchObject({ "one-piece": { newCount: 0, checkedAt: 123 } });
  });
});
