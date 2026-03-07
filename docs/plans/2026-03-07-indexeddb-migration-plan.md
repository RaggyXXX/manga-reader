# IndexedDB Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the app's growing user data from `localStorage` to IndexedDB with one-time migration, async store APIs, and updated UI/context integrations.

**Architecture:** Add a typed IndexedDB layer in `src/lib/db.ts`, migrate domain storage modules to async facades over IndexedDB, and update calling code to hydrate state asynchronously. Keep tiny UI preferences in `localStorage` and preserve legacy storage for rollback safety during the initial rollout.

**Tech Stack:** Next.js app router, React client components, TypeScript, browser IndexedDB, Playwright.

---

### Task 1: Add IndexedDB foundation and migration helpers

**Files:**
- Create: `src/lib/db.ts`
- Test: `tests/unit/db.test.ts`

**Step 1: Write the failing test**

Create tests for:
- opening the database creates expected stores
- migration marker can be read and written
- legacy `localStorage` payloads migrate only once

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/db.test.ts`
Expected: FAIL because `src/lib/db.ts` does not exist yet.

**Step 3: Write minimal implementation**

Implement:
- database open helper
- object store creation for `series`, `chapters`, `bookmarks`, `readingProgress`, `folders`, `updateFlags`, `meta`
- migration marker helpers
- one-time legacy import helpers

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/db.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/db.ts tests/unit/db.test.ts
git commit -m "feat: add indexeddb storage foundation"
```

### Task 2: Convert manga store to async IndexedDB-backed API

**Files:**
- Modify: `src/lib/manga-store.ts`
- Test: `tests/unit/manga-store.test.ts`

**Step 1: Write the failing test**

Add tests for:
- save/get/delete series
- save/get/delete chapters
- sorted chapter retrieval by slug
- favorite/status updates
- total chapter updates

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/manga-store.test.ts`
Expected: FAIL because store still depends on synchronous `localStorage` blobs.

**Step 3: Write minimal implementation**

Refactor `manga-store.ts` to:
- use `src/lib/db.ts`
- expose async functions
- query chapters by `slug`
- update series and chapter records independently
- keep library prefs in `localStorage`

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/manga-store.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/manga-store.ts tests/unit/manga-store.test.ts
git commit -m "refactor: move manga store to indexeddb"
```

### Task 3: Convert bookmarks, reading progress, and folders

**Files:**
- Modify: `src/lib/bookmark-store.ts`
- Modify: `src/lib/reading-progress.ts`
- Modify: `src/lib/folder-store.ts`
- Test: `tests/unit/bookmark-store.test.ts`
- Test: `tests/unit/reading-progress.test.ts`
- Test: `tests/unit/folder-store.test.ts`

**Step 1: Write the failing test**

Add CRUD and persistence tests for each module.

**Step 2: Run test to verify it fails**

Run:
- `npm test -- tests/unit/bookmark-store.test.ts`
- `npm test -- tests/unit/reading-progress.test.ts`
- `npm test -- tests/unit/folder-store.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**

Move each module to async IndexedDB access while preserving current domain behavior.

**Step 4: Run test to verify it passes**

Run the same commands.
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/bookmark-store.ts src/lib/reading-progress.ts src/lib/folder-store.ts tests/unit/bookmark-store.test.ts tests/unit/reading-progress.test.ts tests/unit/folder-store.test.ts
git commit -m "refactor: migrate user stores to indexeddb"
```

### Task 4: Update SyncContext and related flows to async storage

**Files:**
- Modify: `src/contexts/SyncContext.tsx`
- Modify: `src/components/SyncProgressBar.tsx`
- Test: `tests/ui/sync-progress.spec.ts`

**Step 1: Write the failing test**

Extend or add coverage for:
- active sync progress still appears
- update flags persist after reload

**Step 2: Run test to verify it fails**

Run: `npx.cmd playwright test tests/ui/sync-progress.spec.ts --project=chromium --workers=1`
Expected: FAIL due to async storage transition.

**Step 3: Write minimal implementation**

Update SyncContext to:
- load flags asynchronously
- use async chapter and series operations
- keep worker message handling consistent while awaiting writes

**Step 4: Run test to verify it passes**

Run the same Playwright command.
Expected: PASS.

**Step 5: Commit**

```bash
git add src/contexts/SyncContext.tsx src/components/SyncProgressBar.tsx tests/ui/sync-progress.spec.ts
git commit -m "refactor: adapt sync flows to indexeddb storage"
```

### Task 5: Update library, add page, series page, and bookmarks flows to async stores

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/add/page.tsx`
- Modify: `src/app/bookmarks/page.tsx`
- Modify: `src/app/series/[slug]/page.tsx`
- Modify: `src/components/ContinueReading.tsx`
- Modify: `src/components/QuickContinue.tsx`
- Modify: `src/components/SeriesCard.tsx`
- Test: `tests/ui/routes-smoke.spec.ts`
- Test: `tests/ui/featured.spec.ts`

**Step 1: Write the failing test**

Add or extend tests for:
- library renders persisted data after reload
- add page still works with featured and preview flow
- bookmarks page loads persisted bookmarks
- series page shows synced chapters from async store

**Step 2: Run test to verify it fails**

Run:
- `npx.cmd playwright test tests/ui/routes-smoke.spec.ts --project=chromium --workers=1`
- `npx.cmd playwright test tests/ui/featured.spec.ts --project=chromium --workers=1`
Expected: FAIL where sync assumptions break.

**Step 3: Write minimal implementation**

Introduce async hydration patterns in the affected pages and components while keeping UX stable.

**Step 4: Run test to verify it passes**

Run the same commands.
Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/page.tsx src/app/add/page.tsx src/app/bookmarks/page.tsx src/app/series/[slug]/page.tsx src/components/ContinueReading.tsx src/components/QuickContinue.tsx src/components/SeriesCard.tsx tests/ui/routes-smoke.spec.ts tests/ui/featured.spec.ts
git commit -m "refactor: hydrate core pages from indexeddb"
```

### Task 6: Update reader flows to async reading progress

**Files:**
- Modify: `src/components/Reader.tsx`
- Modify: `src/components/reader/Reader.tsx`
- Modify: `src/components/reader/usePreloader.ts`
- Test: `tests/ui/reader.spec.ts`

**Step 1: Write the failing test**

Add tests for:
- reading progress persists after reload
- resume position restores correctly

**Step 2: Run test to verify it fails**

Run: `npx.cmd playwright test tests/ui/reader.spec.ts --project=chromium --workers=1`
Expected: FAIL or missing coverage.

**Step 3: Write minimal implementation**

Update reader components to:
- load saved progress asynchronously
- save progress without blocking the UI
- keep current progress indicators and navigation intact

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/Reader.tsx src/components/reader/Reader.tsx src/components/reader/usePreloader.ts tests/ui/reader.spec.ts
git commit -m "refactor: move reader progress to indexeddb"
```

### Task 7: Update tour demo data seeding and cleanup

**Files:**
- Modify: `src/contexts/TourContext.tsx`
- Test: `tests/ui/tour.spec.ts`

**Step 1: Write the failing test**

Add regression coverage that the tour can still seed demo content and navigate through library, add, series, bookmarks, stats, and install with async storage.

**Step 2: Run test to verify it fails**

Run: `npx.cmd playwright test tests/ui/tour.spec.ts --project=chromium --workers=1`
Expected: FAIL because tour still writes legacy keys directly.

**Step 3: Write minimal implementation**

Refactor TourContext to use the new async storage APIs for seeding and cleanup while preserving existing tour timing and anchors.

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add src/contexts/TourContext.tsx tests/ui/tour.spec.ts
git commit -m "refactor: adapt guided tour demo data to indexeddb"
```

### Task 8: End-to-end migration verification and cleanup

**Files:**
- Modify: `docs/plans/2026-03-07-indexeddb-migration-design.md`
- Modify: `docs/plans/2026-03-07-indexeddb-migration-plan.md`
- Test: `tests/ui/featured.spec.ts`
- Test: `tests/ui/sync-progress.spec.ts`
- Test: `tests/ui/routes-smoke.spec.ts`
- Test: `tests/ui/tour.spec.ts`

**Step 1: Run focused verification**

Run:
- `npx.cmd playwright test tests/ui/featured.spec.ts --project=chromium --workers=1`
- `npx.cmd playwright test tests/ui/sync-progress.spec.ts --project=chromium --workers=1`
- `npx.cmd playwright test tests/ui/routes-smoke.spec.ts --grep "add route renders|add page exposes search input and source filter|mobile nav marks active destination|mobile nav uses icon-only buttons" --project=chromium --workers=1`
- `npx.cmd playwright test tests/ui/tour.spec.ts --project=chromium --workers=1`

Expected: PASS.

**Step 2: Run any available unit suite for new storage modules**

Run: `npm test -- tests/unit`
Expected: PASS.

**Step 3: Update docs if implementation details changed**

Adjust the design and plan docs to reflect the actual store layout or migration marker names if needed.

**Step 4: Commit**

```bash
git add docs/plans/2026-03-07-indexeddb-migration-design.md docs/plans/2026-03-07-indexeddb-migration-plan.md
git commit -m "docs: finalize indexeddb migration plan and verification notes"
```
