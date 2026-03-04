const FOLDERS_KEY = "manga-folders";
const MAX_DEPTH = 10;

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  children: string[]; // folder IDs or series slugs
  createdAt: number;
}

export interface FolderTree {
  folders: Record<string, Folder>;
  rootOrder: string[]; // folder IDs and series slugs at root level
}

// --- Internal helpers ---

function loadTree(): FolderTree {
  if (typeof window === "undefined") return { folders: {}, rootOrder: [] };
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    return raw ? JSON.parse(raw) : { folders: {}, rootOrder: [] };
  } catch {
    return { folders: {}, rootOrder: [] };
  }
}

function saveTree(tree: FolderTree) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(tree));
  } catch {
    // localStorage full or unavailable
  }
}

// --- Public API ---

export function getFolderTree(): FolderTree {
  return loadTree();
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
  const tree = loadTree();
  const id = crypto.randomUUID();
  const folder: Folder = {
    id,
    name,
    parentId: parentId ?? null,
    children: [],
    createdAt: Date.now(),
  };

  tree.folders[id] = folder;

  if (parentId && tree.folders[parentId]) {
    tree.folders[parentId].children.push(id);
  } else {
    tree.rootOrder.push(id);
  }

  saveTree(tree);
  return folder;
}

export function renameFolder(id: string, name: string) {
  const tree = loadTree();
  if (!tree.folders[id]) return;
  tree.folders[id].name = name;
  saveTree(tree);
}

export function deleteFolder(id: string) {
  const tree = loadTree();
  const folder = tree.folders[id];
  if (!folder) return;

  const parentId = folder.parentId;

  // Move children to parent (or root)
  for (const childId of folder.children) {
    if (tree.folders[childId]) {
      // It's a subfolder — update its parentId
      tree.folders[childId].parentId = parentId;
    }
    if (parentId && tree.folders[parentId]) {
      tree.folders[parentId].children.push(childId);
    } else {
      tree.rootOrder.push(childId);
    }
  }

  // Remove from parent's children or rootOrder
  if (parentId && tree.folders[parentId]) {
    tree.folders[parentId].children = tree.folders[parentId].children.filter(
      (c) => c !== id
    );
  } else {
    tree.rootOrder = tree.rootOrder.filter((c) => c !== id);
  }

  // Delete the folder
  delete tree.folders[id];

  saveTree(tree);
}

export function moveToFolder(itemId: string, targetFolderId: string | null) {
  const tree = loadTree();

  // If moving a folder, check MAX_DEPTH
  if (tree.folders[itemId] && targetFolderId) {
    const targetDepth = getFolderDepth(tree, targetFolderId);
    const itemSubtreeDepth = getMaxSubtreeDepth(tree, itemId);
    if (targetDepth + 1 + itemSubtreeDepth >= MAX_DEPTH) return;
  }

  // Remove itemId from all locations
  tree.rootOrder = tree.rootOrder.filter((c) => c !== itemId);
  for (const f of Object.values(tree.folders)) {
    f.children = f.children.filter((c) => c !== itemId);
  }

  // Update parentId if item is a folder
  if (tree.folders[itemId]) {
    tree.folders[itemId].parentId = targetFolderId;
  }

  // Add to target
  if (targetFolderId && tree.folders[targetFolderId]) {
    tree.folders[targetFolderId].children.push(itemId);
  } else {
    tree.rootOrder.push(itemId);
  }

  saveTree(tree);
}

export function createFolderFromDrop(
  slug1: string,
  slug2: string,
  name: string
): Folder {
  const folder = createFolder(name);
  moveToFolder(slug1, folder.id);
  moveToFolder(slug2, folder.id);
  return folder;
}

export function reorderItems(parentId: string | null, orderedIds: string[]) {
  const tree = loadTree();
  if (parentId && tree.folders[parentId]) {
    tree.folders[parentId].children = orderedIds;
  } else {
    tree.rootOrder = orderedIds;
  }
  saveTree(tree);
}

export function syncWithSeries(allSlugs: string[]): FolderTree {
  const tree = loadTree();
  const slugSet = new Set(allSlugs);

  // Collect all tracked slugs (non-folder items) across the tree
  const tracked = new Set<string>();
  for (const id of tree.rootOrder) {
    if (!tree.folders[id]) tracked.add(id);
  }
  for (const f of Object.values(tree.folders)) {
    for (const c of f.children) {
      if (!tree.folders[c]) tracked.add(c);
    }
  }

  // Add missing slugs to rootOrder
  for (const slug of allSlugs) {
    if (!tracked.has(slug)) {
      tree.rootOrder.push(slug);
    }
  }

  // Remove deleted slugs from rootOrder
  tree.rootOrder = tree.rootOrder.filter(
    (id) => tree.folders[id] || slugSet.has(id)
  );

  // Remove deleted slugs from folder children
  for (const f of Object.values(tree.folders)) {
    f.children = f.children.filter((c) => tree.folders[c] || slugSet.has(c));
  }

  saveTree(tree);
  return tree;
}

// --- Internal depth helper ---

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
