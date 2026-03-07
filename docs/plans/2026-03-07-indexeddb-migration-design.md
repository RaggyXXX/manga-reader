# IndexedDB Migration Design

**Date:** 2026-03-07

## Goal

Migrate the app's growing user data from synchronous `localStorage` blobs to a structured IndexedDB storage layer without losing existing user data or breaking core flows.

## Current State

The app currently stores most user data in `localStorage`:
- library series and chapters in `src/lib/manga-store.ts`
- bookmarks in `src/lib/bookmark-store.ts`
- reading progress in `src/lib/reading-progress.ts`
- folder tree in `src/lib/folder-store.ts`
- sync update flags in `src/contexts/SyncContext.tsx`
- tour demo seed/reset logic directly reads and writes storage keys in `src/contexts/TourContext.tsx`

This has three structural problems:
1. data is serialized as large JSON blobs on every write
2. all storage access is synchronous and can block rendering
3. failures due to storage limits are mostly silent

## Storage Model

Use a hybrid storage model.

### IndexedDB stores

Move growing user data to IndexedDB:
- `series`
- `chapters`
- `bookmarks`
- `readingProgress`
- `folders`
- `updateFlags`

### localStorage stays for small UI state

Keep small, immediate UI preferences in `localStorage`:
- theme
- reader settings
- tour done flag
- lightweight UI preferences like library sort and view mode

## Architecture

Add a central IndexedDB access layer in `src/lib/db.ts` with:
- database open and upgrade logic
- typed object store access helpers
- migration support
- small query helpers for common access patterns

Existing storage modules remain as domain-facing APIs, but become async:
- `src/lib/manga-store.ts`
- `src/lib/bookmark-store.ts`
- `src/lib/reading-progress.ts`
- `src/lib/folder-store.ts`

UI and context code will be updated to await these APIs.

## Migration Strategy

On first app startup after the change:
1. open IndexedDB
2. check a migration marker
3. read legacy `localStorage` data for the migrated stores
4. bulk insert the data into IndexedDB inside transactions
5. mark migration complete

The migration should be idempotent. If the marker exists, skip re-importing.

Legacy `localStorage` data should not be deleted immediately during the initial rollout. This avoids irreversible loss if a migration bug appears. The app should simply stop depending on it for normal reads once migration succeeds.

## Data Access Rules

### Series
- one record per slug
- keep current metadata fields intact
- retrieval supports all-series and by-slug lookup

### Chapters
- store chapters as individual records keyed by compound identity, not one giant map
- support queries by `slug`
- support `slug + chapter number`
- preserve ordering by chapter number

### Bookmarks
- store per bookmark entry rather than a single serialized blob
- support lookup by series and chapter

### Reading Progress
- store one progress record per `slug + chapter`
- support fast current-position updates

### Folders
- folder tree can remain as one structured record initially to keep migration simple
- later it can be normalized if folder scale grows

### Update Flags
- store keyed by slug
- SyncContext reads and writes async

## Tour Compatibility

`src/contexts/TourContext.tsx` currently seeds demo content by directly mutating `localStorage` keys. That has to be rewritten to use the new async store APIs. The tour should still inject and remove demo data, but through the same storage layer as the rest of the app.

## Error Handling

Do not silently swallow storage failures for migrated domains.

Requirements:
- failed reads return safe empty values where needed
- failed writes surface a usable error path for callers
- migration failure does not wipe legacy data
- app should remain usable even if a subset of data cannot be persisted

## Testing Strategy

### Store-level tests
- IndexedDB open and upgrade
- one-time migration from legacy `localStorage`
- CRUD for series and chapters
- CRUD for bookmarks and reading progress
- folder and update flag persistence

### UI / integration coverage
- library persists after reload
- reader progress persists after reload
- bookmarks persist after reload
- tour demo seeding still works
- sync/update badge flow still works with async storage

## Recommended Rollout Order

1. add IndexedDB layer and migration helper
2. migrate `manga-store` first because it is the heaviest risk area
3. migrate bookmarks, reading progress, folders, update flags
4. adapt contexts and pages to async APIs
5. fix tour demo seeding
6. verify reload and storage persistence flows end to end

## Risks

### Async API conversion
The biggest change is converting call sites from synchronous reads to async flows. This touches contexts, pages, and event handlers.

### Startup loading
Pages that currently assume immediate storage availability need loading states or effect-based hydration.

### Existing user data
Migration must be safe, idempotent, and tested against real legacy key shapes.
