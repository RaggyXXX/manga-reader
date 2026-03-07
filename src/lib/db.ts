"use client";

export const DB_NAME = "manga-blast";
export const DB_VERSION = 1;

export const SERIES_KEY = "manga-series";
export const CHAPTERS_KEY = "manga-chapters";
export const BOOKMARKS_KEY = "manga-bookmarks";
export const PROGRESS_KEY = "manga-reader-progress";
export const FOLDERS_KEY = "manga-folders";
export const UPDATE_FLAGS_KEY = "manga-update-flags";
export const META_LEGACY_MIGRATED_AT = "legacy-migrated-at";

export const LEGACY_KEYS = {
  series: SERIES_KEY,
  chapters: CHAPTERS_KEY,
  bookmarks: BOOKMARKS_KEY,
  readingProgress: PROGRESS_KEY,
  folders: FOLDERS_KEY,
  updateFlags: UPDATE_FLAGS_KEY,
} as const;

export const dbStores = {
  meta: "meta",
  series: "series",
  chapters: "chapters",
  bookmarks: "bookmarks",
  readingProgress: "readingProgress",
  folders: "folders",
  updateFlags: "updateFlags",
} as const;

export type MangaDbStoreName = keyof typeof dbStores;

type StorageLike = Pick<Storage, "getItem">;

interface MetaRecord {
  key: string;
  value: string;
}

interface FolderTreeRecord {
  key: "tree";
  value: {
    folders: Record<string, unknown>;
    rootOrder: string[];
  };
}

function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function requestToPromise<T = undefined>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export function queueMicrotaskSafe(callback: () => void) {
  Promise.resolve().then(callback).catch(() => {});
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function ensureStores(db: IDBDatabase) {
  if (!db.objectStoreNames.contains(dbStores.series)) {
    db.createObjectStore(dbStores.series, { keyPath: "slug" });
  }

  if (!db.objectStoreNames.contains(dbStores.chapters)) {
    const chapters = db.createObjectStore(dbStores.chapters, { keyPath: ["slug", "number"] });
    chapters.createIndex("by-slug", "slug", { unique: false });
  }

  if (!db.objectStoreNames.contains(dbStores.bookmarks)) {
    const bookmarks = db.createObjectStore(dbStores.bookmarks, { keyPath: "id" });
    bookmarks.createIndex("by-slug", "slug", { unique: false });
    bookmarks.createIndex("by-slug-chapter", ["slug", "chapterNumber"], { unique: false });
  }

  if (!db.objectStoreNames.contains(dbStores.readingProgress)) {
    db.createObjectStore(dbStores.readingProgress, { keyPath: "slug" });
  }

  if (!db.objectStoreNames.contains(dbStores.folders)) {
    db.createObjectStore(dbStores.folders, { keyPath: "key" });
  }

  if (!db.objectStoreNames.contains(dbStores.updateFlags)) {
    db.createObjectStore(dbStores.updateFlags, { keyPath: "slug" });
  }

  if (!db.objectStoreNames.contains(dbStores.meta)) {
    db.createObjectStore(dbStores.meta, { keyPath: "key" });
  }
}

export function openMangaDatabase(): Promise<IDBDatabase> {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(new Error("IndexedDB is not available in this environment"));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      ensureStores(request.result);
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open IndexedDB"));
    };
  });
}

export const openDb = openMangaDatabase;

export async function deleteMangaDatabase(): Promise<void> {
  if (!isIndexedDbAvailable()) return;

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Failed to delete IndexedDB database"));
    request.onblocked = () => reject(new Error("IndexedDB database deletion was blocked"));
  });
}

export async function getMetaValue(key: string): Promise<string | null> {
  const db = await openMangaDatabase();
  const tx = db.transaction(dbStores.meta, "readonly");
  const record = await requestToPromise<MetaRecord | undefined>(tx.objectStore(dbStores.meta).get(key));
  await transactionDone(tx);
  db.close();
  return record?.value ?? null;
}

export async function setMetaValue(key: string, value: string): Promise<void> {
  const db = await openMangaDatabase();
  const tx = db.transaction(dbStores.meta, "readwrite");
  tx.objectStore(dbStores.meta).put({ key, value } satisfies MetaRecord);
  await transactionDone(tx);
  db.close();
}

async function putMany(storeName: MangaDbStoreName, records: unknown[]) {
  if (records.length === 0) return;
  const db = await openMangaDatabase();
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  for (const record of records) {
    store.put(record);
  }
  await transactionDone(tx);
  db.close();
}

export async function putRecord(storeName: MangaDbStoreName, record: unknown): Promise<void> {
  const db = await openMangaDatabase();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).put(record);
  await transactionDone(tx);
  db.close();
}

export async function deleteRecord(
  storeName: MangaDbStoreName,
  key: IDBValidKey | IDBKeyRange,
): Promise<void> {
  const db = await openMangaDatabase();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).delete(key);
  await transactionDone(tx);
  db.close();
}

export async function clearStore(storeName: MangaDbStoreName): Promise<void> {
  const db = await openMangaDatabase();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).clear();
  await transactionDone(tx);
  db.close();
}

function parseJson<T>(storage: StorageLike, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function importLegacySeries(storage: StorageLike): unknown[] {
  const entries = parseJson<Record<string, unknown>>(storage, SERIES_KEY, {});
  return Object.values(entries);
}

function importLegacyChapters(storage: StorageLike): unknown[] {
  const entries = parseJson<Record<string, Record<string, Record<string, unknown>>>>(storage, CHAPTERS_KEY, {});

  return Object.entries(entries).flatMap(([slug, chapterMap]) =>
    Object.values(chapterMap).map((chapter) => ({
      slug,
      ...chapter,
    })),
  );
}

function importLegacyBookmarks(storage: StorageLike): unknown[] {
  const entries = parseJson<Record<string, unknown[]>>(storage, BOOKMARKS_KEY, {});
  return Object.values(entries).flat();
}

function importLegacyReadingProgress(storage: StorageLike): unknown[] {
  const entries = parseJson<Record<string, Record<string, unknown>>>(storage, PROGRESS_KEY, {});
  return Object.entries(entries).map(([slug, progress]) => ({
    slug,
    ...progress,
  }));
}

function importLegacyFolders(storage: StorageLike): FolderTreeRecord[] {
  const tree = parseJson<Record<string, unknown>>(storage, FOLDERS_KEY, {
    folders: {},
    rootOrder: [],
  });

  return [
    {
      key: "tree",
      value: {
        folders: (tree.folders as Record<string, unknown>) ?? {},
        rootOrder: Array.isArray(tree.rootOrder) ? (tree.rootOrder as string[]) : [],
      },
    },
  ];
}

function importLegacyUpdateFlags(storage: StorageLike): unknown[] {
  const entries = parseJson<Record<string, Record<string, unknown>>>(storage, UPDATE_FLAGS_KEY, {});
  return Object.entries(entries).map(([slug, flag]) => ({
    slug,
    ...flag,
  }));
}

export async function ensureLegacyDataMigrated(storage?: StorageLike): Promise<boolean> {
  const storageToUse =
    storage ??
    (typeof globalThis !== "undefined" && "localStorage" in globalThis
      ? (globalThis.localStorage as StorageLike)
      : undefined);
  if (!storageToUse) return false;

  const alreadyMigrated = await getMetaValue(META_LEGACY_MIGRATED_AT);
  if (alreadyMigrated) return false;

  await putMany(dbStores.series, importLegacySeries(storageToUse));
  await putMany(dbStores.chapters, importLegacyChapters(storageToUse));
  await putMany(dbStores.bookmarks, importLegacyBookmarks(storageToUse));
  await putMany(dbStores.readingProgress, importLegacyReadingProgress(storageToUse));
  await putMany(dbStores.folders, importLegacyFolders(storageToUse));
  await putMany(dbStores.updateFlags, importLegacyUpdateFlags(storageToUse));
  await setMetaValue(META_LEGACY_MIGRATED_AT, new Date().toISOString());

  return true;
}

export async function getAllRecords<T = unknown>(storeName: MangaDbStoreName): Promise<T[]> {
  const db = await openMangaDatabase();
  const tx = db.transaction(storeName, "readonly");
  const records = await requestToPromise<T[]>(tx.objectStore(storeName).getAll());
  await transactionDone(tx);
  db.close();
  return records;
}

export async function getAllFromStore<T = unknown>(storeName: MangaDbStoreName): Promise<T[]> {
  return getAllRecords<T>(storeName);
}

export async function getAllFromIndex<T = unknown>(
  storeName: MangaDbStoreName,
  indexName: string,
  query?: IDBValidKey | IDBKeyRange | null,
): Promise<T[]> {
  const db = await openMangaDatabase();
  const tx = db.transaction(storeName, "readonly");
  const source = tx.objectStore(storeName).index(indexName);
  const records = await requestToPromise<T[]>(query == null ? source.getAll() : source.getAll(query));
  await transactionDone(tx);
  db.close();
  return records;
}

export async function getRecordByKey<T = unknown>(
  storeName: MangaDbStoreName,
  key: IDBValidKey | IDBKeyRange,
): Promise<T | null> {
  const db = await openMangaDatabase();
  const tx = db.transaction(storeName, "readonly");
  const record = await requestToPromise<T | undefined>(tx.objectStore(storeName).get(key));
  await transactionDone(tx);
  db.close();
  return record ?? null;
}

export async function getByIndex<T = unknown>(
  storeName: MangaDbStoreName,
  indexName: string,
  key: IDBValidKey | IDBKeyRange,
): Promise<T[]> {
  const db = await openMangaDatabase();
  const tx = db.transaction(storeName, "readonly");
  const records = await requestToPromise<T[]>(tx.objectStore(storeName).index(indexName).getAll(key));
  await transactionDone(tx);
  db.close();
  return records;
}

export async function hasCompletedLegacyMigration(): Promise<boolean> {
  return (await getMetaValue(META_LEGACY_MIGRATED_AT)) !== null;
}

export async function markLegacyMigrationComplete(): Promise<void> {
  await setMetaValue(META_LEGACY_MIGRATED_AT, new Date().toISOString());
}

export async function migrateLegacyLocalStorageData(): Promise<boolean> {
  return ensureLegacyDataMigrated();
}
