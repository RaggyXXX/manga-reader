# Design: Bookmarks, Folders, Panel Mode, Quick Action Widget

**Date:** 2026-03-04
**Status:** Approved

---

## Feature 1: Mid-Chapter Bookmarks

### Data Model
New localStorage key `"manga-bookmarks"`:
```
Record<string, Bookmark[]>  // keyed by series slug

Bookmark = {
  id: string              // nanoid
  slug: string
  chapterNumber: number
  imageIndex: number      // which image on the page
  note?: string           // optional short text
  createdAt: number
}
```

### Reader Integration
- Long-press (600ms) on an image shows a popup: "Set Bookmark" with optional text field
- Small bookmark icon appears at the image edge for existing bookmarks
- Bookmark icon with badge count in the top reader bar for the current chapter

### Bookmarks Page (`/bookmarks`)
- Grid of cards — each card shows the page image as a thumbnail (lazy-loaded from cached `imageUrls`)
- Below thumbnail: series title, chapter number, page number, note (if any)
- Tap jumps directly to the reader at that position
- Filterable by series
- Accessible from Stats page (card like "How to Install") and optionally nav

---

## Feature 2: Custom Tags / Collections (iPhone-Style Drag-Drop Folders)

### Data Model
New localStorage key `"manga-folders"`:
```
FolderTree = {
  folders: Record<string, Folder>
  rootOrder: string[]          // order on top level (folder IDs + series slug strings)
}

Folder = {
  id: string
  name: string
  parentId: string | null      // null = root level
  children: string[]           // folder IDs or series slugs, in order
  coverUrl?: string            // first series cover or custom
  createdAt: number
}
```

Max nesting depth: 10 levels. Series not in any folder remain at root level.

### Grid View — iPhone-Style Drag-Drop
- Long-press (existing 500ms timer) activates Jiggle Mode (all cards wiggle slightly like iOS)
- In Jiggle Mode: cards become draggable (pointer events based drag)
- Drag series onto series → new folder created (short overlay "Name folder")
- Drag series onto folder → added to folder
- Folder shows a 2x2 mini-grid of first 4 covers as preview (like iOS folders)
- Tap folder → opens it, shows content with breadcrumb navigation at top
- "X" button on each card in Jiggle Mode to remove from folder (moves back to root)
- "+" button for creating new empty folder in Jiggle Mode
- Long-press on folder → Rename / Delete (contents moved to root)
- Drag folder onto folder for nesting (up to depth 10)

### List View
- Folders as collapsible sections (chevron + folder name + count badge)
- Indentation per depth level (incremental padding-left)
- "Move" button (three-dot menu) per series → opens folder picker dialog
- Drag handle on left of each row for reorder sorting

---

## Feature 3: Panel-by-Panel Reading Mode

### Approach: Canvas-based Gutter Detection (opt-in via Reader Settings)

### Algorithm (client-side, per image)
1. Image loaded into offscreen `<canvas>`
2. Pixels reduced to grayscale
3. Horizontal + vertical scan lines search for continuous bright (>240) or dark (<15) stripes (gutters)
4. Gutters divide image into regions (panels)
5. Panels sorted by reading direction (RTL for manga, LTR for manhwa — based on current `readingMode`)
6. Result cached per image (avoids re-computation when navigating back)

### Reader Integration
- New reading mode: `"panel"` alongside vertical/page/rtl/double-page
- Shows one panel at a time, centered in viewport with zoom-to-fit
- Swipe/tap navigates to next panel, then to next image
- Progress bar shows panel progress within the page
- Fallback: if no gutters found (e.g. splash page or manhwa), shows full image like page mode

### Reader Settings
- New option in mode selection: Panel icon (grid symbol)
- NOT default — must be actively selected
- Label: "Panel" with short hint "Automatically detects panel boundaries"

### Limitations
- Works best with classic manga with clear gutter lines
- Manhwa/webtoons (no gutters) automatically fall back to full-page view
- Complex layouts (overlapping panels, borderless) may be incorrectly detected

---

## Feature 4: Quick Action "Continue Reading" Widget

### Placement
Top of Library page, above the existing Continue Reading carousel.

### Layout (~80px tall compact card)
```
┌─────────────────────────────────────────────┐
│ ▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ ▓▓▓▓  Solo Leveling              ▶ Read   │
│ ▓▓▓▓  Chapter 142, Page 12        →→→     │
│ ▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
└─────────────────────────────────────────────┘
```

- **Left:** Series cover (~60px) with hard edge
- **Cover fade:** Cover image extends right and fades via `mask-image: linear-gradient(to right, black 60px, transparent 200px)` into card background. Semi-transparent overlay on top for readability.
- **Text:** Series title (bold, 1 line truncated) + "Chapter X, Page Y" (muted, small)
- **Right:** Compact "Read" button or play icon
- **Tap:** Navigates directly to `/read/[slug]/[chapter]` at saved scroll position
- **Shows:** Most recently read series (based on `lastReadAt` from reading progress)
- **Hidden:** When no reading progress exists
