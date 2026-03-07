"use client";

import { dbStores, deleteRecord, ensureLegacyDataMigrated, getAllFromStore, putRecord, queueMicrotaskSafe } from "./db";

export interface UpdateFlag {
  newCount: number;
  checkedAt: number;
}

export type UpdateFlags = Record<string, UpdateFlag>;

let updateFlagsCache: UpdateFlags = {};
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

export async function initUpdateFlagStore(): Promise<void> {
  if (ready) return;
  if (!initPromise) {
    initPromise = (async () => {
      await ensureLegacyDataMigrated();
      const records = await getAllFromStore<(UpdateFlag & { slug: string })>(dbStores.updateFlags);
      updateFlagsCache = Object.fromEntries(records.map(({ slug, ...flag }) => [slug, flag]));
      ready = true;
    })();
  }
  await initPromise;
}

export function __resetUpdateFlagStoreForTests() {
  updateFlagsCache = {};
  ready = false;
  initPromise = null;
  writeQueue = Promise.resolve();
}

export function getUpdateFlags(): UpdateFlags {
  return { ...updateFlagsCache };
}

export function setUpdateFlag(slug: string, flag: UpdateFlag) {
  updateFlagsCache[slug] = flag;
  enqueueWrite(() => putRecord(dbStores.updateFlags, { slug, ...flag }));
  emitStorageUpdate();
}

export function clearUpdateFlagValue(slug: string) {
  const existing = updateFlagsCache[slug];
  if (!existing) return;
  updateFlagsCache[slug] = { ...existing, newCount: 0 };
  enqueueWrite(() => putRecord(dbStores.updateFlags, { slug, ...updateFlagsCache[slug] }));
  emitStorageUpdate();
}

export function removeUpdateFlag(slug: string) {
  delete updateFlagsCache[slug];
  enqueueWrite(() => deleteRecord(dbStores.updateFlags, slug));
  emitStorageUpdate();
}
