import { beforeEach, describe, expect, it } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
import {
  LEGACY_KEYS,
  dbStores,
  deleteMangaDatabase,
  getAllFromStore,
  getRecordByKey,
  hasCompletedLegacyMigration,
  markLegacyMigrationComplete,
  migrateLegacyLocalStorageData,
  openDb,
} from "../../src/lib/db";

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

function seedLegacyLocalStorage() {
  localStorage.setItem(
    LEGACY_KEYS.series,
    JSON.stringify({
      "one-piece": {
        slug: "one-piece",
        title: "One Piece",
        coverUrl: "/one-piece.jpg",
        sourceUrl: "https://example.com/one-piece",
        totalChapters: 1200,
        addedAt: 123,
        source: "mangadex",
      },
    })
  );

  localStorage.setItem(
    LEGACY_KEYS.chapters,
    JSON.stringify({
      "one-piece": {
        "1": {
          number: 1,
          title: "Romance Dawn",
          url: "https://example.com/ch-1",
          imageUrls: ["https://img/1.jpg"],
          syncedAt: 555,
        },
      },
    })
  );

  localStorage.setItem(
    LEGACY_KEYS.bookmarks,
    JSON.stringify({
      "one-piece": [
        {
          id: "bookmark-1",
          slug: "one-piece",
          chapterNumber: 1,
          imageIndex: 0,
          note: "Start here",
          createdAt: 999,
        },
      ],
    })
  );

  localStorage.setItem(
    LEGACY_KEYS.readingProgress,
    JSON.stringify({
      "one-piece": {
        lastReadChapter: 1,
        readChapters: [1],
        chapterProgress: {
          1: {
            scrollPercent: 100,
            imageIndex: 0,
            timestamp: 888,
          },
        },
      },
    })
  );

  localStorage.setItem(
    LEGACY_KEYS.folders,
    JSON.stringify({
      folders: {},
      rootOrder: ["one-piece"],
    })
  );

  localStorage.setItem(
    LEGACY_KEYS.updateFlags,
    JSON.stringify({
      "one-piece": {
        newCount: 2,
        checkedAt: 777,
      },
    })
  );
}

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

  await deleteMangaDatabase();
});

describe("db", () => {
  it("creates the expected object stores", async () => {
    const db = await openDb();

    expect(Array.from(db.objectStoreNames)).toEqual(
      expect.arrayContaining([
        dbStores.meta,
        dbStores.series,
        dbStores.chapters,
        dbStores.bookmarks,
        dbStores.readingProgress,
        dbStores.folders,
        dbStores.updateFlags,
      ])
    );
    db.close();
  });

  it("can mark and read the legacy migration marker", async () => {
    await expect(hasCompletedLegacyMigration()).resolves.toBe(false);

    await markLegacyMigrationComplete();

    await expect(hasCompletedLegacyMigration()).resolves.toBe(true);
  });

  it("migrates legacy localStorage data only once", async () => {
    seedLegacyLocalStorage();

    await expect(migrateLegacyLocalStorageData()).resolves.toBe(true);
    await expect(migrateLegacyLocalStorageData()).resolves.toBe(false);

    await expect(getRecordByKey(dbStores.series, "one-piece")).resolves.toMatchObject({
      slug: "one-piece",
      title: "One Piece",
    });
    await expect(getRecordByKey(dbStores.chapters, ["one-piece", 1])).resolves.toMatchObject({
      slug: "one-piece",
      number: 1,
      title: "Romance Dawn",
    });
    await expect(getAllFromStore(dbStores.bookmarks)).resolves.toHaveLength(1);
    await expect(getRecordByKey(dbStores.readingProgress, "one-piece")).resolves.toMatchObject({
      slug: "one-piece",
      lastReadChapter: 1,
    });
    await expect(getRecordByKey(dbStores.folders, "tree")).resolves.toMatchObject({
      key: "tree",
      value: { folders: {}, rootOrder: ["one-piece"] },
    });
    await expect(getRecordByKey(dbStores.updateFlags, "one-piece")).resolves.toMatchObject({
      slug: "one-piece",
      newCount: 2,
    });
    await expect(hasCompletedLegacyMigration()).resolves.toBe(true);
  });
});
