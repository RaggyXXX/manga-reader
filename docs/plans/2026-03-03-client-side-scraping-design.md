# Client-Side Scraping Architecture — Design Document

**Date:** 2026-03-03
**Status:** Approved

## Problem

The manga reader's crawling architecture relies on Puppeteer (headless Chrome) running inside Netlify serverless functions. This causes two critical failures:

1. **"Sync All" doesn't work** — Netlify functions have a 10s timeout, but Puppeteer needs 20-90s per chapter. Batch processing has no chaining, so only the first batch (20 chapters) partially completes before the function is killed.
2. **Multiple chapter clicks fail** — Each click spawns a separate Chromium instance (~100-200MB), exhausting Netlify's memory limit. Concurrent browsers crash.

## Investigation Findings

Plain HTTP requests to manhwazone.to work without Puppeteer:
- Chapter images are server-rendered in HTML via `data-src` attributes
- Cloudflare is present but does not block standard HTTP requests
- Image CDN (`c4.manhwatop.com`) blocks requests with `Referer: manhwazone.to` but works without referer
- JSON search API exists at `/ajax/search?q=...`
- Full chapter list loaded via Livewire AJAX, but chapters have prev/next navigation links
- URL structure: `/series/{slug}-{id}/chapter-{num}-{hash}`

## Architecture

**Principle: Everything runs client-side. Server only proxies requests for CORS bypass.**

```
Client (Browser/PWA)
├── LocalStorage
│   ├── manga-series: series metadata
│   ├── manga-chapters: chapter URLs + image URLs
│   ├── manga-reading-progress: existing (no change)
│   └── manga-reader-settings: existing (no change)
├── Cache API (via Service Worker)
│   └── manga-images-v1: cached chapter images
├── Client Scraping Engine
│   └── fetch via /api/proxy → parse HTML → store results
└── Service Worker
    └── intercept + cache images, prefetch upcoming chapters

Server (Netlify)
├── /api/proxy?url=... → CORS proxy (whitelist: manhwazone.to, manhwatop.com)
└── Static Next.js app → serves the UI
```

### What Gets Removed

- MongoDB, Mongoose, all models (Series, Chapter, CrawlJob)
- Puppeteer, chromium-min, puppeteer-extra, stealth plugin
- All server-side API routes except proxy
- Netlify background function
- `src/lib/db.ts`, `src/lib/crawler.ts`, `src/lib/models/*`
- `src/app/api/chapters/`, `src/app/api/crawl/`, `src/app/api/series/`
- `netlify/functions/crawl-chapters-background.mts`

### What Stays

- Reading progress in LocalStorage (no change)
- Reader settings in LocalStorage (no change)
- All UI components, pages, styles
- PWA infrastructure (manifest, icons)

### What's New

- `/api/proxy` — generic CORS proxy for whitelisted domains
- `src/lib/scraper.ts` — client-side HTML scraping engine
- `src/lib/manga-store.ts` — LocalStorage abstraction for series/chapters
- Enhanced Service Worker with image caching + prefetch

## Data Flow

### Adding a Series

1. User pastes manhwazone.to URL
2. Client fetches series page via `/api/proxy`
3. Parses title, cover URL, first/latest chapter links
4. Stores series metadata in LocalStorage
5. No chapters crawled yet

### "Sync All" (Chapter Discovery + Image Caching)

1. Load series from LocalStorage, check which chapters already have image URLs
2. Start from chapter 1 (or last discovered chapter), fetch page via proxy
3. Parse HTML: extract image `data-src` URLs + next chapter link
4. Store chapter data in LocalStorage (number, URL, imageUrls[])
5. Service Worker caches actual images in Cache API
6. Follow "next chapter" link → repeat from step 3
7. **1-2 second delay** between each chapter request
8. Progress saved after each chapter — interruption-safe
9. Re-clicking "Sync All" skips chapters that already have image URLs

### Reading a Chapter

1. Check LocalStorage for chapter image URLs
2. If found → load images from Cache API (offline-capable)
3. If not cached → load through `/api/proxy` (and cache for next time)
4. Prefetch next 1-2 chapters in background

### Cache Cleanup (Settings)

1. Settings page lists series with cached chapter counts
2. User selects individual series to delete
3. Clears Cache API images + LocalStorage chapter data for that series

## Technical Details

### `/api/proxy` Endpoint

- `GET /api/proxy?url=<encoded-url>`
- Whitelist: only `manhwazone.to` and `manhwatop.com` domains
- HTML responses: pass through as text, no-cache headers
- Image responses: strip `Referer` header, add long cache headers
- Security: reject non-whitelisted domains

### Client Scraping Module (`src/lib/scraper.ts`)

- `discoverSeries(url)` — parse series page for title, cover, first+latest chapter
- `discoverChapters(firstChapterUrl, onProgress)` — follow next links, build chapter list
- `scrapeChapter(chapterUrl)` — extract `data-src` image URLs via DOMParser
- All requests via `/api/proxy` with 1-2s delays
- Returns parsed data, doesn't handle storage

### LocalStorage Schema

```
manga-series: {
  [slug]: { title, coverUrl, sourceUrl, totalChapters, addedAt }
}

manga-chapters: {
  [slug]: {
    [chapterNum]: { url, title, imageUrls[], syncedAt }
  }
}

manga-reading-progress: (existing, no change)
manga-reader-settings: (existing, no change)
```

### Service Worker Enhancements

- Intercept image requests → serve from `manga-images-v1` cache if available
- Prefetch function: given image URL list, cache in background
- Per-series cache size tracking for settings page

### Packages to Remove from `package.json`

- `mongoose`
- `puppeteer-core`
- `puppeteer-extra`
- `puppeteer-extra-plugin-stealth`
- `@sparticuz/chromium-min`

## UI Changes

### Sync Progress (Series Detail Page)

- "Sync All" button shows progress: `"Syncing... 23/145 chapters"`
- Stop button to pause mid-sync
- If partially synced: `"Continue Sync (23/145)"`
- Per-chapter indicator: cached (check icon) vs not cached

### Cache Management (Settings Page)

- "Offline Storage" section
- List of series with name, cached count, approximate size
- Per-series checkbox + "Delete Selected" button
- "Clear All" with confirmation

### Reader

- Loads from cache first, falls back to proxy
- Prefetches next 1-2 chapters in background

## Future Phase: UI Overhaul

Separate from this work — complete visual redesign:
- shadcn/ui component library
- Warm pastel theme (Catppuccin / "Pastel Dreams" style)
- Cozy anime-like aesthetic
- Subtle animations
- Custom components replacing current glassmorphic design
