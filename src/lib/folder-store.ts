"use client";

import { dbStores, ensureLegacyDataMigrated, getRecordByKey, putRecord, queueMicrotaskSafe } from "./db";

const MAX_DEPTH = 10;

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  children: string[];
  createdAt: number;
}

export interface FolderTree {
  folders: Record<string, Folder>;
  rootOrder: string[];
}

let folderTreeCache: FolderTree = { folders: {}, rootOrder: [] };
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

function cloneTree(tree: FolderTree): FolderTree {
  return {
    folders: Object.fromEntries(
      Object.entries(tree.folders).map(([id, folder]) => [id, { ...folder, children: [...folder.children] }]),
    ),
    rootOrder: [...tree.rootOrder],
  };
}

function persistTree() {
  const snapshot = cloneTree(folderTreeCache);
  enqueueWrite(() => putRecord(dbStores.folders, { key: "tree", value: snapshot }));
}

export async function initFolderStore(): Promise<void> {
  if (ready) return;
  if (!initPromise) {
    initPromise = (async () => {
      await ensureLegacyDataMigrated();
      const record = await getRecordByKey<{ key: "tree"; value: FolderTree }>(dbStores.folders, "tree");
      folderTreeCache = record?.value ? cloneTree(record.value) : { folders: {}, rootOrder: [] };
      ready = true;
    })();
  }
  await initPromise;
}

export function __resetFolderStoreForTests() {
  folderTreeCache = { folders: {}, rootOrder: [] };
  ready = false;
  initPromise = null;
  writeQueue = Promise.resolve();
}

export function getFolderTree(): FolderTree {
  return cloneTree(folderTreeCache);
}

export function getFolderDepth(tree: FolderTree, folderId: string): number {
  let depth = 0;
  let currentId: string | null = folderId;
  while (currentId) {
    const folder: Folder | undefined = tree.folders[currentId];
    if (!folder || !folder.parentId) break;
    depth++;
    currentId = folder.parentId;
  }
  return depth;
}

export function createFolder(name: string, parentId?: string | null): Folder {
  const id = crypto.randomUUID();
  const folder: Folder = { id, name, parentId: parentId ?? null, children: [], createdAt: Date.now() };

  folderTreeCache.folders[id] = folder;
  if (parentId && folderTreeCache.folders[parentId]) folderTreeCache.folders[parentId].children.push(id);
  else folderTreeCache.rootOrder.push(id);

  persistTree();
  emitStorageUpdate();
  return folder;
}

export function renameFolder(id: string, name: string) {
  if (!folderTreeCache.folders[id]) return;
  folderTreeCache.folders[id].name = name;
  persistTree();
  emitStorageUpdate();
}

export function deleteFolder(id: string) {
  const folder = folderTreeCache.folders[id];
  if (!folder) return;

  const parentId = folder.parentId;
  for (const childId of folder.children) {
    if (folderTreeCache.folders[childId]) {
      folderTreeCache.folders[childId].parentId = parentId;
    }
    if (parentId && folderTreeCache.folders[parentId]) folderTreeCache.folders[parentId].children.push(childId);
    else folderTreeCache.rootOrder.push(childId);
  }

  if (parentId && folderTreeCache.folders[parentId]) {
    folderTreeCache.folders[parentId].children = folderTreeCache.folders[parentId].children.filter((child) => child !== id);
  } else {
    folderTreeCache.rootOrder = folderTreeCache.rootOrder.filter((child) => child !== id);
  }

  delete folderTreeCache.folders[id];
  persistTree();
  emitStorageUpdate();
}

export function moveToFolder(itemId: string, targetFolderId: string | null) {
  if (folderTreeCache.folders[itemId] && targetFolderId) {
    const targetDepth = getFolderDepth(folderTreeCache, targetFolderId);
    const itemSubtreeDepth = getMaxSubtreeDepth(folderTreeCache, itemId);
    if (targetDepth + 1 + itemSubtreeDepth >= MAX_DEPTH) return;
  }

  folderTreeCache.rootOrder = folderTreeCache.rootOrder.filter((child) => child !== itemId);
  for (const folder of Object.values(folderTreeCache.folders)) {
    folder.children = folder.children.filter((child) => child !== itemId);
  }

  if (folderTreeCache.folders[itemId]) {
    folderTreeCache.folders[itemId].parentId = targetFolderId;
  }

  if (targetFolderId && folderTreeCache.folders[targetFolderId]) {
    folderTreeCache.folders[targetFolderId].children.push(itemId);
  } else {
    folderTreeCache.rootOrder.push(itemId);
  }

  persistTree();
  emitStorageUpdate();
}

export function createFolderFromDrop(slug1: string, slug2: string, name: string): Folder {
  const folder = createFolder(name);
  moveToFolder(slug1, folder.id);
  moveToFolder(slug2, folder.id);
  return folder;
}

export function reorderItems(parentId: string | null, orderedIds: string[]) {
  if (parentId && folderTreeCache.folders[parentId]) folderTreeCache.folders[parentId].children = orderedIds;
  else folderTreeCache.rootOrder = orderedIds;
  persistTree();
  emitStorageUpdate();
}

export function syncWithSeries(allSlugs: string[]): FolderTree {
  const slugSet = new Set(allSlugs);
  const tracked = new Set<string>();

  for (const id of folderTreeCache.rootOrder) {
    if (!folderTreeCache.folders[id]) tracked.add(id);
  }
  for (const folder of Object.values(folderTreeCache.folders)) {
    for (const child of folder.children) {
      if (!folderTreeCache.folders[child]) tracked.add(child);
    }
  }

  for (const slug of allSlugs) {
    if (!tracked.has(slug)) folderTreeCache.rootOrder.push(slug);
  }

  folderTreeCache.rootOrder = folderTreeCache.rootOrder.filter((id) => folderTreeCache.folders[id] || slugSet.has(id));
  for (const folder of Object.values(folderTreeCache.folders)) {
    folder.children = folder.children.filter((child) => folderTreeCache.folders[child] || slugSet.has(child));
  }

  persistTree();
  return getFolderTree();
}

function getMaxSubtreeDepth(tree: FolderTree, folderId: string): number {
  const folder = tree.folders[folderId];
  if (!folder) return 0;
  let max = 0;
  for (const childId of folder.children) {
    if (tree.folders[childId]) {
      const childDepth = 1 + getMaxSubtreeDepth(tree, childId);
      if (childDepth > max) max = childDepth;
    }
  }
  return max;
}
