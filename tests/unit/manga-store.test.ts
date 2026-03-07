import { beforeEach, describe, expect, it } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
import { deleteMangaDatabase } from "../../src/lib/db";
import {
  __resetMangaStoreForTests,
  deleteSeries,
  getAllSeries,
  getChapter,
  getChapters,
  getLibraryPrefs,
  getSeries,
  getSyncedChapterCount,
  getUnsyncedChapters,
  initMangaStore,
  isMangaStoreReady,
  saveChapter,
  saveChapters,
  saveLibraryPrefs,
  saveSeries,
  toggleFavorite,
  updateReadingStatus,
  updateSeriesTotalChapters,
  type StoredSeries,
} from "../../src/lib/manga-store";

class MemoryStorage implements Storage {
  private map = new Map<string, string>();

  get length() {
    return this.map.size;
  }

  clear() {
    this.map.clear();
  }

  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  key(index: number) {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.map.delete(key);
  }

  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

const baseSeries: StoredSeries = {
  slug: "one-piece",
  title: "One Piece",
  coverUrl: "/one-piece.jpg",
  sourceUrl: "https://example.com/one-piece",
  totalChapters: 2,
  addedAt: 123,
  source: "mangadex",
};

beforeEach(async () => {
  Object.defineProperty(globalThis, "indexedDB", {
    value: fakeIndexedDB,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });

  __resetMangaStoreForTests();
  await deleteMangaDatabase();
  await initMangaStore();
});

describe("manga-store", () => {
  it("initializes the cache-backed store", () => {
    expect(isMangaStoreReady()).toBe(true);
  });

  it("saves and loads series sorted by added date", () => {
    saveSeries(baseSeries);
    saveSeries({ ...baseSeries, slug: "naruto", title: "Naruto", addedAt: 456 });

    expect(getSeries("one-piece")).toMatchObject({ title: "One Piece" });
    expect(getAllSeries()).toMatchObject([{ slug: "naruto" }, { slug: "one-piece" }]);
  });

  it("saves chapters and returns them ordered", () => {
    saveSeries(baseSeries);
    saveChapters("one-piece", [
      { number: 2, title: "B", url: "/2", imageUrls: [], syncedAt: null },
      { number: 1, title: "A", url: "/1", imageUrls: ["img"], syncedAt: 1 },
    ]);

    expect(getChapter("one-piece", 1)).toMatchObject({ title: "A" });
    expect(getChapters("one-piece")).toMatchObject([
      { number: 1, title: "A" },
      { number: 2, title: "B" },
    ]);
    expect(getSyncedChapterCount("one-piece")).toBe(1);
    expect(getUnsyncedChapters("one-piece")).toMatchObject([{ number: 2 }]);
  });

  it("updates series metadata and deletes related chapters", () => {
    saveSeries(baseSeries);
    saveChapter("one-piece", { number: 1, title: "A", url: "/1", imageUrls: [], syncedAt: null });

    expect(toggleFavorite("one-piece")).toBe(true);
    updateReadingStatus("one-piece", "reading");
    updateSeriesTotalChapters("one-piece", 10);
    expect(getSeries("one-piece")).toMatchObject({
      isFavorite: true,
      readingStatus: "reading",
      totalChapters: 10,
    });

    deleteSeries("one-piece");
    expect(getSeries("one-piece")).toBeNull();
    expect(getChapters("one-piece")).toEqual([]);
  });

  it("keeps library prefs in localStorage", () => {
    saveLibraryPrefs({ sortBy: "alphabetical", viewMode: "list" });
    expect(getLibraryPrefs()).toMatchObject({ sortBy: "alphabetical", viewMode: "list" });
  });
});
