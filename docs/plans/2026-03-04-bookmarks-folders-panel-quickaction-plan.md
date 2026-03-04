# Bookmarks, Folders, Panel Mode & Quick Action Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add mid-chapter bookmarks, iPhone-style drag-drop folder organization, panel-by-panel reading mode with gutter detection, and a compact quick-action "continue reading" widget to the Manga Blast PWA.

**Architecture:** Four independent features sharing the existing localStorage persistence pattern. Bookmarks get a new store + reader integration + page. Folders get a new store + deeply modified library page with drag-drop via pointer events. Panel mode adds a canvas-based gutter detector + new reader component. Quick action replaces the ContinueReading carousel header with a compact cover-fade card.

**Tech Stack:** React 19, Next.js 16, Tailwind CSS 3, Framer Motion, localStorage, Canvas API, Pointer Events API

---

## Task 1: Bookmark Store (`src/lib/bookmark-store.ts`)

**Files:**
- Create: `src/lib/bookmark-store.ts`

**Step 1: Create the bookmark store**

```typescript
// src/lib/bookmark-store.ts
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
  } catch {}
}

export function getBookmarks(slug: string): Bookmark[] {
  return loadAll()[slug] ?? [];
}

export function getAllBookmarks(): AllBookmarks {
  return loadAll();
}

export function addBookmark(slug: string, chapterNumber: number, imageIndex: number, note?: string): Bookmark {
  const all = loadAll();
  const bookmark: Bookmark = {
    id: crypto.randomUUID(),
    slug,
    chapterNumber,
    imageIndex,
    note,
    createdAt: Date.now(),
  };
  if (!all[slug]) all[slug] = [];
  all[slug].push(bookmark);
  saveAll(all);
  return bookmark;
}

export function removeBookmark(slug: string, id: string) {
  const all = loadAll();
  if (!all[slug]) return;
  all[slug] = all[slug].filter((b) => b.id !== id);
  if (all[slug].length === 0) delete all[slug];
  saveAll(all);
}

export function getChapterBookmarks(slug: string, chapterNumber: number): Bookmark[] {
  return getBookmarks(slug).filter((b) => b.chapterNumber === chapterNumber);
}

export function hasBookmark(slug: string, chapterNumber: number, imageIndex: number): boolean {
  return getBookmarks(slug).some((b) => b.chapterNumber === chapterNumber && b.imageIndex === imageIndex);
}
```

**Step 2: Commit**
```bash
git add src/lib/bookmark-store.ts
git commit -m "feat: add bookmark store with CRUD operations"
```

---

## Task 2: Bookmark Popup in Reader (`src/components/reader/BookmarkPopup.tsx`)

**Files:**
- Create: `src/components/reader/BookmarkPopup.tsx`
- Create: `src/components/reader/BookmarkPopup.module.css`

**Step 1: Create the popup component**

A small floating popup that appears on long-press of an image in the reader. Shows "Set Bookmark" with an optional note field and Save/Cancel buttons. Position it near the long-press point.

```typescript
// src/components/reader/BookmarkPopup.tsx
"use client";

import { useState } from "react";
import styles from "./BookmarkPopup.module.css";

interface Props {
  x: number;
  y: number;
  onSave: (note: string) => void;
  onCancel: () => void;
}

export default function BookmarkPopup({ x, y, onSave, onCancel }: Props) {
  const [note, setNote] = useState("");

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div
        className={styles.popup}
        style={{ top: Math.min(y, window.innerHeight - 180), left: Math.max(16, Math.min(x - 120, window.innerWidth - 256)) }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className={styles.title}>Set Bookmark</p>
        <input
          className={styles.input}
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={100}
          autoFocus
        />
        <div className={styles.buttons}>
          <button className={styles.cancelBtn} onClick={onCancel} type="button">Cancel</button>
          <button className={styles.saveBtn} onClick={() => onSave(note)} type="button">Save</button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Create CSS module** (`BookmarkPopup.module.css`)

Style the overlay as `position: fixed; inset: 0; z-index: 100`, the popup as a floating card with `position: fixed`, white/dark bg, rounded corners, shadow, ~240px wide. Input styled to match app theme. Save button in primary color.

**Step 3: Commit**
```bash
git add src/components/reader/BookmarkPopup.tsx src/components/reader/BookmarkPopup.module.css
git commit -m "feat: add BookmarkPopup component for reader"
```

---

## Task 3: Integrate Bookmarks into Reader Component

**Files:**
- Modify: `src/components/reader/Reader.tsx`
- Modify: `src/components/reader/VerticalReader.tsx`
- Modify: `src/components/reader/PageReader.tsx`

**Step 1: Add bookmark state and long-press handling to Reader.tsx**

Add to Reader.tsx imports:
```typescript
import { addBookmark, getChapterBookmarks, type Bookmark } from "@/lib/bookmark-store";
import BookmarkPopup from "./BookmarkPopup";
import { Bookmark as BookmarkIcon } from "lucide-react";
```

Add state:
```typescript
const [bookmarkPopup, setBookmarkPopup] = useState<{ x: number; y: number; imageIndex: number } | null>(null);
const [chapterBookmarks, setChapterBookmarks] = useState<Bookmark[]>([]);
```

Load bookmarks on mount/chapter change:
```typescript
useEffect(() => {
  setChapterBookmarks(getChapterBookmarks(slug, chapterNumber));
}, [slug, chapterNumber]);
```

Add `onLongPressImage` callback to ModeProps and pass it through:
```typescript
const handleLongPressImage = useCallback((imageIndex: number, x: number, y: number) => {
  setBookmarkPopup({ x, y, imageIndex });
}, []);

const handleSaveBookmark = useCallback((note: string) => {
  if (!bookmarkPopup) return;
  addBookmark(slug, chapterNumber, bookmarkPopup.imageIndex, note || undefined);
  setChapterBookmarks(getChapterBookmarks(slug, chapterNumber));
  setBookmarkPopup(null);
}, [bookmarkPopup, slug, chapterNumber]);
```

Add `onLongPressImage` to modeProps. Add `bookmarkedIndices` (Set of image indices that have bookmarks) to modeProps for overlay icons.

Render BookmarkPopup conditionally and bookmark badge in top bar:
```tsx
{bookmarkPopup && (
  <BookmarkPopup
    x={bookmarkPopup.x}
    y={bookmarkPopup.y}
    onSave={handleSaveBookmark}
    onCancel={() => setBookmarkPopup(null)}
  />
)}
```

Add bookmark icon with count badge next to settings button in the top bar.

**Step 2: Add long-press detection to VerticalReader and PageReader**

In VerticalReader: Add a long-press timer on each `<img>`. On `onPointerDown` start a 600ms timer, on `onPointerMove` (if moved > 10px) cancel, on `onPointerUp` cancel. When timer fires, call `onLongPressImage(index, clientX, clientY)`. Add a small bookmark icon overlay on images that have bookmarks (using the `bookmarkedIndices` set).

In PageReader: Same long-press logic but only for the single currently displayed image.

**Step 3: Commit**
```bash
git add src/components/reader/Reader.tsx src/components/reader/VerticalReader.tsx src/components/reader/PageReader.tsx
git commit -m "feat: integrate bookmark long-press and overlay into reader"
```

---

## Task 4: Bookmarks Page (`src/app/bookmarks/page.tsx`)

**Files:**
- Create: `src/app/bookmarks/page.tsx`
- Modify: `src/app/stats/page.tsx` (add "Bookmarks" card)

**Step 1: Create the bookmarks page**

Page layout following existing patterns (ContextBackChevron + title). Shows a grid of bookmark cards grouped by series. Each card displays:
- The page image as thumbnail (from cached `imageUrls` via `getChapter(slug, chapterNum).imageUrls[imageIndex]`)
- Series title, chapter number, page number
- Note text if present
- Tap navigates to `/read/[slug]/[chapter]`
- Delete button (X) on each card

Add a series filter dropdown at the top (using getAllBookmarks keys mapped to series titles via getSeries).

Use `getAllBookmarks()` to load data, `getSeries()` for titles, `getChapter()` for image URLs.

**Step 2: Add bookmarks card to stats page**

In `src/app/stats/page.tsx`, after the "How to Install" card, add:
```tsx
<Card>
  <CardContent className="flex items-center justify-between p-4">
    <div>
      <p className="font-medium">Bookmarks</p>
      <p className="text-sm text-muted-foreground">Your saved pages and panels</p>
    </div>
    <Button variant="outline" size="sm" asChild>
      <Link href="/bookmarks">
        <BookmarkIcon className="mr-1 h-4 w-4" />
        View
      </Link>
    </Button>
  </CardContent>
</Card>
```

Import `Bookmark as BookmarkIcon` from lucide-react.

**Step 3: Commit**
```bash
git add src/app/bookmarks/page.tsx src/app/stats/page.tsx
git commit -m "feat: add bookmarks page with thumbnail grid and stats link"
```

---

## Task 5: Folder Store (`src/lib/folder-store.ts`)

**Files:**
- Create: `src/lib/folder-store.ts`

**Step 1: Create the folder store**

```typescript
// src/lib/folder-store.ts
const FOLDERS_KEY = "manga-folders";

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  children: string[];  // folder IDs or series slugs
  createdAt: number;
}

export interface FolderTree {
  folders: Record<string, Folder>;
  rootOrder: string[];  // folder IDs and series slugs at root level
}

const EMPTY_TREE: FolderTree = { folders: {}, rootOrder: [] };
const MAX_DEPTH = 10;

function load(): FolderTree {
  if (typeof window === "undefined") return EMPTY_TREE;
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    return raw ? JSON.parse(raw) : EMPTY_TREE;
  } catch {
    return EMPTY_TREE;
  }
}

function save(tree: FolderTree) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(tree));
  } catch {}
}

export function getFolderTree(): FolderTree { return load(); }

export function getFolderDepth(tree: FolderTree, folderId: string): number {
  let depth = 0;
  let current = tree.folders[folderId];
  while (current?.parentId) {
    depth++;
    current = tree.folders[current.parentId];
  }
  return depth;
}

export function createFolder(name: string, parentId: string | null = null): Folder {
  const tree = load();
  const folder: Folder = {
    id: crypto.randomUUID(),
    name,
    parentId,
    children: [],
    createdAt: Date.now(),
  };
  tree.folders[folder.id] = folder;
  if (parentId && tree.folders[parentId]) {
    tree.folders[parentId].children.push(folder.id);
  } else {
    tree.rootOrder.push(folder.id);
  }
  save(tree);
  return folder;
}

export function renameFolder(id: string, name: string) {
  const tree = load();
  if (tree.folders[id]) {
    tree.folders[id].name = name;
    save(tree);
  }
}

export function deleteFolder(id: string) {
  const tree = load();
  const folder = tree.folders[id];
  if (!folder) return;
  // Move children to parent (or root)
  for (const child of folder.children) {
    if (tree.folders[child]) {
      tree.folders[child].parentId = folder.parentId;
    }
    if (folder.parentId && tree.folders[folder.parentId]) {
      tree.folders[folder.parentId].children.push(child);
    } else {
      tree.rootOrder.push(child);
    }
  }
  // Remove from parent's children or rootOrder
  if (folder.parentId && tree.folders[folder.parentId]) {
    tree.folders[folder.parentId].children = tree.folders[folder.parentId].children.filter((c) => c !== id);
  } else {
    tree.rootOrder = tree.rootOrder.filter((c) => c !== id);
  }
  delete tree.folders[id];
  save(tree);
}

export function moveToFolder(itemId: string, targetFolderId: string | null) {
  const tree = load();
  // Check depth constraint
  if (targetFolderId && tree.folders[itemId]) {
    const targetDepth = getFolderDepth(tree, targetFolderId);
    if (targetDepth >= MAX_DEPTH - 1) return; // can't nest deeper
  }
  // Remove from current location
  tree.rootOrder = tree.rootOrder.filter((c) => c !== itemId);
  for (const f of Object.values(tree.folders)) {
    f.children = f.children.filter((c) => c !== itemId);
  }
  // Add to target
  if (targetFolderId && tree.folders[targetFolderId]) {
    tree.folders[targetFolderId].children.push(itemId);
    if (tree.folders[itemId]) tree.folders[itemId].parentId = targetFolderId;
  } else {
    tree.rootOrder.push(itemId);
    if (tree.folders[itemId]) tree.folders[itemId].parentId = null;
  }
  save(tree);
}

export function createFolderFromDrop(slug1: string, slug2: string, name: string): Folder {
  const folder = createFolder(name);
  moveToFolder(slug1, folder.id);
  moveToFolder(slug2, folder.id);
  return folder;
}

export function reorderItems(parentId: string | null, orderedIds: string[]) {
  const tree = load();
  if (parentId && tree.folders[parentId]) {
    tree.folders[parentId].children = orderedIds;
  } else {
    tree.rootOrder = orderedIds;
  }
  save(tree);
}

// Ensure all series slugs appear somewhere in the tree
export function syncWithSeries(allSlugs: string[]) {
  const tree = load();
  const tracked = new Set<string>();
  // Collect all slugs in folders
  tracked.add(...tree.rootOrder.filter((id) => !tree.folders[id]));
  for (const f of Object.values(tree.folders)) {
    for (const c of f.children) {
      if (!tree.folders[c]) tracked.add(c);
    }
  }
  // Add missing slugs to rootOrder
  let changed = false;
  for (const slug of allSlugs) {
    if (!tracked.has(slug)) {
      tree.rootOrder.push(slug);
      changed = true;
    }
  }
  // Remove deleted slugs
  const slugSet = new Set(allSlugs);
  tree.rootOrder = tree.rootOrder.filter((id) => tree.folders[id] || slugSet.has(id));
  for (const f of Object.values(tree.folders)) {
    f.children = f.children.filter((id) => tree.folders[id] || slugSet.has(id));
  }
  if (changed) save(tree);
  return tree;
}
```

**Step 2: Commit**
```bash
git add src/lib/folder-store.ts
git commit -m "feat: add folder store with nested tree operations"
```

---

## Task 6: Folder Card Component (`src/components/FolderCard.tsx`)

**Files:**
- Create: `src/components/FolderCard.tsx`

**Step 1: Create the folder card**

A card that displays a folder with a 2x2 mini-grid of the first 4 series covers inside it (like iOS folders). Shows folder name below. In jiggle mode, has an "X" delete button. In list variant, shows as a collapsible row with chevron, folder name, and count badge.

Uses `getSeries()` to load cover URLs for each child slug. Non-slug children (sub-folders) show a generic folder icon in the mini-grid.

**Step 2: Commit**
```bash
git add src/components/FolderCard.tsx
git commit -m "feat: add FolderCard with 2x2 cover mini-grid"
```

---

## Task 7: Drag-Drop & Jiggle Mode in Library Page

**Files:**
- Modify: `src/app/page.tsx` (major changes)
- Create: `src/components/FolderPickerDialog.tsx`

This is the largest task. The library page needs these new capabilities:

**Step 1: Add folder state management to LibraryPage**

Import folder store functions. Add state:
```typescript
const [folderTree, setFolderTree] = useState<FolderTree>(() => syncWithSeries(allSlugs));
const [currentFolderId, setCurrentFolderId] = useState<string | null>(null); // null = root
const [jiggleMode, setJiggleMode] = useState(false);
const [draggedItem, setDraggedItem] = useState<string | null>(null);
const [dropTarget, setDropTarget] = useState<string | null>(null);
```

Build breadcrumb path from `currentFolderId` back to root.

Compute visible items: if `currentFolderId` is null, use `folderTree.rootOrder`; otherwise `folderTree.folders[currentFolderId].children`. Map each item to either a FolderCard or SeriesCard based on whether `folderTree.folders[itemId]` exists.

**Step 2: Jiggle Mode activation**

Replace the existing long-press handler: when not in selection mode, long-press now activates jiggle mode instead. In jiggle mode, all cards get a CSS `jiggle` animation (small rotation wobble via `@keyframes jiggle { 0%,100% { rotate: -1deg } 50% { rotate: 1deg } }`). A "Done" button appears in the toolbar to exit jiggle mode.

**Step 3: Drag-Drop via Pointer Events (Grid View)**

In jiggle mode, each card gets:
- `onPointerDown`: Record start position, set `draggedItem`
- `onPointerMove`: If dragged > 20px, show a floating ghost card following the pointer. Calculate which card is under the pointer using `document.elementFromPoint()`. Set `dropTarget` to highlight that card.
- `onPointerUp`: If `dropTarget` exists:
  - If dropping series on series → prompt folder name (small inline input), call `createFolderFromDrop()`
  - If dropping series/folder on folder → call `moveToFolder()`
  - If dropping on empty space → `moveToFolder(itemId, currentFolderId)` (move to current level)
  - Respect MAX_DEPTH check

The ghost card is a fixed-position clone with 0.8 opacity and slight scale. The drop target gets a blue ring highlight.

**Step 4: Breadcrumb navigation**

When `currentFolderId` is not null, show a breadcrumb bar above the grid:
```
< Root / Action / Favorites /
```
Each segment is tappable to navigate to that folder level.

**Step 5: Folder name prompt**

When creating a folder from a drop, show a small inline modal asking for the folder name with a text input, Save/Cancel buttons. Default name: "New Folder".

**Step 6: List View — Collapsible sections + Move dialog**

In list view:
- Folders render as collapsible sections with chevron toggle
- Indentation: `paddingLeft: depth * 16px`
- Each series row gets a three-dot menu button → "Move to folder" opens FolderPickerDialog

**Step 7: Create FolderPickerDialog**

A dialog (using existing Radix Dialog) that shows the folder tree as a nested list. Each folder row is tappable. Shows "Root" at top. Confirms move on selection.

**Step 8: Commit**
```bash
git add src/app/page.tsx src/components/FolderCard.tsx src/components/FolderPickerDialog.tsx
git commit -m "feat: iPhone-style drag-drop folders with jiggle mode in library"
```

---

## Task 8: Panel Detection Algorithm (`src/lib/panel-detector.ts`)

**Files:**
- Create: `src/lib/panel-detector.ts`

**Step 1: Create the gutter detection module**

```typescript
// src/lib/panel-detector.ts

export interface PanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GutterResult {
  panels: PanelRect[];
  hasPanels: boolean; // false if no gutters found (fallback to full image)
}

// Cache: imageUrl → panels
const panelCache = new Map<string, GutterResult>();

export function clearPanelCache() {
  panelCache.clear();
}

export async function detectPanels(imageUrl: string, rtl: boolean = false): Promise<GutterResult> {
  const cached = panelCache.get(imageUrl);
  if (cached) return cached;

  const img = await loadImage(imageUrl);
  const { width, height } = img;

  // Skip very small images
  if (width < 200 || height < 200) {
    const result = { panels: [{ x: 0, y: 0, width, height }], hasPanels: false };
    panelCache.set(imageUrl, result);
    return result;
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  // Convert to grayscale brightness array
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  // Find horizontal gutters (rows where >90% of pixels are gutter-colored)
  const hGutters = findHorizontalGutters(gray, width, height);
  // Find vertical gutters (columns where >90% are gutter-colored)
  const vGutters = findVerticalGutters(gray, width, height);

  if (hGutters.length === 0 && vGutters.length === 0) {
    const result = { panels: [{ x: 0, y: 0, width, height }], hasPanels: false };
    panelCache.set(imageUrl, result);
    return result;
  }

  // Build panel rectangles from gutter intersections
  const panels = buildPanels(width, height, hGutters, vGutters);

  // Sort panels by reading order
  sortPanels(panels, rtl);

  const result = { panels, hasPanels: panels.length > 1 };
  panelCache.set(imageUrl, result);
  return result;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function isGutterPixel(value: number): boolean {
  return value > 240 || value < 15; // white or black gutter
}

function findHorizontalGutters(gray: Uint8Array, w: number, h: number): number[] {
  const gutters: number[] = [];
  const minRun = 8; // minimum gutter thickness in pixels
  let runStart = -1;

  for (let y = 0; y < h; y++) {
    let gutterPixels = 0;
    for (let x = 0; x < w; x++) {
      if (isGutterPixel(gray[y * w + x])) gutterPixels++;
    }
    const ratio = gutterPixels / w;
    if (ratio > 0.9) {
      if (runStart === -1) runStart = y;
    } else {
      if (runStart !== -1 && y - runStart >= minRun) {
        gutters.push(Math.round((runStart + y) / 2));
      }
      runStart = -1;
    }
  }
  return gutters;
}

function findVerticalGutters(gray: Uint8Array, w: number, h: number): number[] {
  const gutters: number[] = [];
  const minRun = 8;
  let runStart = -1;

  for (let x = 0; x < w; x++) {
    let gutterPixels = 0;
    for (let y = 0; y < h; y++) {
      if (isGutterPixel(gray[y * w + x])) gutterPixels++;
    }
    const ratio = gutterPixels / h;
    if (ratio > 0.9) {
      if (runStart === -1) runStart = x;
    } else {
      if (runStart !== -1 && x - runStart >= minRun) {
        gutters.push(Math.round((runStart + x) / 2));
      }
      runStart = -1;
    }
  }
  return gutters;
}

function buildPanels(w: number, h: number, hGutters: number[], vGutters: number[]): PanelRect[] {
  const yEdges = [0, ...hGutters, h];
  const xEdges = [0, ...vGutters, w];
  const panels: PanelRect[] = [];

  for (let row = 0; row < yEdges.length - 1; row++) {
    for (let col = 0; col < xEdges.length - 1; col++) {
      const x = xEdges[col];
      const y = yEdges[row];
      const pw = xEdges[col + 1] - x;
      const ph = yEdges[row + 1] - y;
      // Skip very thin strips (leftover gutter fragments)
      if (pw > 40 && ph > 40) {
        panels.push({ x, y, width: pw, height: ph });
      }
    }
  }
  return panels;
}

function sortPanels(panels: PanelRect[], rtl: boolean) {
  panels.sort((a, b) => {
    // Primary: top to bottom (by row)
    const rowDiff = a.y - b.y;
    if (Math.abs(rowDiff) > 30) return rowDiff;
    // Secondary: left-to-right or right-to-left
    return rtl ? b.x - a.x : a.x - b.x;
  });
}
```

**Step 2: Commit**
```bash
git add src/lib/panel-detector.ts
git commit -m "feat: add canvas-based panel gutter detection algorithm"
```

---

## Task 9: Panel Reader Component (`src/components/reader/PanelReader.tsx`)

**Files:**
- Create: `src/components/reader/PanelReader.tsx`
- Create: `src/components/reader/PanelReader.module.css`

**Step 1: Create the PanelReader**

Displays one panel at a time from the current image. Uses `detectPanels()` to get panel rects. Shows the cropped panel region zoomed-to-fit in the viewport. Swipe/tap advances to next panel; when panels exhausted, moves to next image.

State:
- `currentImageIdx: number`
- `currentPanelIdx: number`
- `panels: PanelRect[]` (for current image)
- `loading: boolean` (while detecting)

On image change: call `detectPanels(imageUrl, isRtl)`, set panels. If `!hasPanels`, treat entire image as single panel.

Rendering: Use a `<div>` with `overflow: hidden` showing a `<canvas>` or `<img>` with CSS `object-position` and `object-fit` to crop to the current panel rect. Alternatively use `clip-path: inset(...)` or a canvas `drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh)`.

Touch/swipe: Same pattern as PageReader — swipe left = next panel, right = prev. Tap zones: left/center/right.

Progress: Report combined progress = `(imageIdx * avgPanels + panelIdx) / (totalImages * avgPanels)`.

**Step 2: Create CSS module** with container, panel viewport, transition styles.

**Step 3: Commit**
```bash
git add src/components/reader/PanelReader.tsx src/components/reader/PanelReader.module.css
git commit -m "feat: add PanelReader component with panel-by-panel navigation"
```

---

## Task 10: Integrate Panel Mode into Reader & Settings

**Files:**
- Modify: `src/lib/types.ts` — add `"panel"` to `ReadingMode`
- Modify: `src/components/reader/Reader.tsx` — add PanelReader case to switch
- Modify: `src/components/reader/ReaderSettingsDrawer.tsx` — add Panel button to mode row

**Step 1: Update ReadingMode type**

In `src/lib/types.ts`:
```typescript
export type ReadingMode = "vertical" | "page" | "rtl" | "double-page" | "panel";
```

**Step 2: Add PanelReader to Reader.tsx switch**

```typescript
import PanelReader from "./PanelReader";

// In the switch:
case "panel":
  modeElement = <PanelReader {...modeProps} />;
  break;
```

**Step 3: Add Panel icon and button to ReaderSettingsDrawer**

Add after the IconDouble function:
```typescript
function IconPanel() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="1" y="9" width="14" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
```

Add to `readingModes` array:
```typescript
{ value: 'panel', label: 'Panel', icon: <IconPanel /> },
```

**Step 4: Commit**
```bash
git add src/lib/types.ts src/components/reader/Reader.tsx src/components/reader/ReaderSettingsDrawer.tsx
git commit -m "feat: integrate panel reading mode into reader and settings"
```

---

## Task 11: Quick Action Widget (`src/components/QuickContinue.tsx`)

**Files:**
- Create: `src/components/QuickContinue.tsx`
- Modify: `src/app/page.tsx` — add QuickContinue above ContinueReading

**Step 1: Create the QuickContinue component**

A compact card (~80px tall) for the most recently read series. Cover image extends left-to-right with a mask-image fade. Text overlay with series title and chapter/page info. Tap navigates to reader.

```typescript
// src/components/QuickContinue.tsx
"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { getProgress } from "@/lib/reading-progress";
import { imageProxyUrl } from "@/lib/scraper";
import type { MangaSource, StoredSeries } from "@/lib/manga-store";

interface QuickContinueProps {
  series: StoredSeries[];
}

export function QuickContinue({ series }: QuickContinueProps) {
  const router = useRouter();

  const item = useMemo(() => {
    let best: { slug: string; title: string; coverUrl: string; source?: MangaSource;
                chapter: number; imageIndex: number; timestamp: number } | null = null;

    for (const s of series) {
      const progress = getProgress(s.slug);
      if (!progress?.lastReadChapter) continue;
      const pos = progress.chapterProgress[progress.lastReadChapter];
      const ts = pos?.timestamp ?? 0;
      if (!best || ts > best.timestamp) {
        best = {
          slug: s.slug,
          title: s.title,
          coverUrl: s.coverUrl,
          source: s.source,
          chapter: progress.lastReadChapter,
          imageIndex: pos?.imageIndex ?? 0,
          timestamp: ts,
        };
      }
    }
    return best;
  }, [series]);

  if (!item) return null;

  const coverSrc = item.coverUrl ? imageProxyUrl(item.coverUrl, item.source) : undefined;

  return (
    <button
      type="button"
      onClick={() => router.push(`/read/${item.slug}/${item.chapter}`)}
      className="group relative mb-5 flex h-20 w-full items-center overflow-hidden rounded-2xl border border-border/70 bg-card text-left shadow-sm transition-all hover:shadow-md"
      aria-label={`Continue reading ${item.title}`}
    >
      {/* Cover image with fade */}
      {coverSrc && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${coverSrc})`,
            maskImage: "linear-gradient(to right, black 60px, transparent 220px)",
            WebkitMaskImage: "linear-gradient(to right, black 60px, transparent 220px)",
          }}
        />
      )}
      {/* Semi-transparent overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-background/80 to-background/95" />

      {/* Text content */}
      <div className="relative flex flex-1 items-center justify-between px-4 pl-20">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
          <p className="text-xs text-muted-foreground">
            Chapter {item.chapter}, Page {item.imageIndex + 1}
          </p>
        </div>
        <div className="ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-105">
          <Play className="h-4 w-4" />
        </div>
      </div>
    </button>
  );
}
```

**Step 2: Add to library page**

In `src/app/page.tsx`, import `QuickContinue` and render above ContinueReading:
```tsx
{!isEmpty && <QuickContinue series={series} />}
{!isEmpty && <ContinueReading series={...} />}
```

**Step 3: Commit**
```bash
git add src/components/QuickContinue.tsx src/app/page.tsx
git commit -m "feat: add compact QuickContinue widget with cover fade"
```

---

## Task 12: Build Verification & Final Polish

**Files:** None new

**Step 1: Run build**
```bash
npx next build
```
Expected: Build succeeds with no TypeScript errors.

**Step 2: Visual verification**

Check each feature in the browser:
1. `/bookmarks` page loads with correct layout
2. Reader long-press shows bookmark popup
3. Library jiggle mode activates on long-press
4. Drag-drop creates folders
5. Panel mode appears in reader settings
6. QuickContinue widget appears at top of library
7. Folder breadcrumb navigation works

**Step 3: Final commit if any fixes needed**
```bash
git add -A
git commit -m "fix: polish and build fixes for new features"
```

---

## Implementation Order Summary

| # | Task | Depends On | Estimated Complexity |
|---|------|-----------|---------------------|
| 1 | Bookmark Store | — | Small |
| 2 | Bookmark Popup | — | Small |
| 3 | Reader Bookmark Integration | 1, 2 | Medium |
| 4 | Bookmarks Page | 1 | Medium |
| 5 | Folder Store | — | Medium |
| 6 | Folder Card | 5 | Small |
| 7 | Drag-Drop Library | 5, 6 | Large |
| 8 | Panel Detector | — | Medium |
| 9 | Panel Reader | 8 | Medium |
| 10 | Panel Mode Integration | 9 | Small |
| 11 | Quick Continue Widget | — | Small |
| 12 | Build Verification | All | Small |

Tasks 1-4 (Bookmarks), 5-7 (Folders), 8-10 (Panel), and 11 (Quick Action) are independent feature tracks that can be parallelized.
