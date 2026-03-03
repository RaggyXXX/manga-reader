# Client-Side Scraping Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Puppeteer/MongoDB-based server crawling with fully client-side HTTP scraping. All data stored in localStorage + Cache API. No database.

**Architecture:** Client fetches manhwazone.to HTML via a CORS proxy (`/api/proxy`), parses it with DOMParser, stores series/chapter metadata in localStorage, and caches images via Service Worker. The server only serves the Next.js app and the proxy endpoint.

**Tech Stack:** Next.js 16, React 19, localStorage, Cache API, Service Worker, DOMParser

---

### Task 1: Create CORS Proxy Endpoint

**Files:**
- Create: `src/app/api/proxy/route.ts`

**Step 1: Create the proxy route**

```typescript
// src/app/api/proxy/route.ts
import { NextRequest, NextResponse } from "next/server";

const ALLOWED_HOSTS = ["manhwazone.to", "www.manhwazone.to", "c4.manhwatop.com", "media.manhwazone.to"];

const FETCH_TIMEOUT = 15000;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    // Don't send manhwazone.to referer to image CDN (it blocks it)
    const isImageCdn = parsed.hostname.includes("manhwatop.com");
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    };
    if (!isImageCdn) {
      headers["Referer"] = "https://manhwazone.to/";
    }

    const resp = await fetch(url, { signal: controller.signal, headers });
    clearTimeout(timeout);

    if (!resp.ok) {
      return NextResponse.json({ error: `Upstream ${resp.status}` }, { status: resp.status });
    }

    const contentType = resp.headers.get("content-type") || "application/octet-stream";
    const isHtml = contentType.includes("text/html");

    if (isHtml) {
      const text = await resp.text();
      return new NextResponse(text, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache",
        },
      });
    }

    // Images / other binary
    return new NextResponse(resp.body, {
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const isTimeout = message.includes("abort");
    return NextResponse.json(
      { error: isTimeout ? "Upstream timeout" : "Fetch failed" },
      { status: isTimeout ? 504 : 502 }
    );
  }
}
```

**Step 2: Verify the proxy works**

Run: `npm run dev`
Then in browser console: `fetch('/api/proxy?url=https://manhwazone.to/series').then(r=>r.text()).then(t=>console.log(t.substring(0,500)))`
Expected: HTML content from manhwazone.to

**Step 3: Commit**

```bash
git add src/app/api/proxy/route.ts
git commit -m "feat: add CORS proxy endpoint for client-side scraping"
```

---

### Task 2: Create Manga Store (localStorage)

**Files:**
- Create: `src/lib/manga-store.ts`

**Step 1: Create the store module**

```typescript
// src/lib/manga-store.ts
const SERIES_KEY = "manga-series";
const CHAPTERS_KEY = "manga-chapters";

export interface StoredSeries {
  slug: string;
  title: string;
  coverUrl: string;
  sourceUrl: string;
  totalChapters: number;
  addedAt: number;
}

export interface StoredChapter {
  number: number;
  title: string;
  url: string;
  imageUrls: string[];
  syncedAt: number | null;
}

type SeriesMap = Record<string, StoredSeries>;
type ChaptersMap = Record<string, Record<number, StoredChapter>>;

function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, data: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // localStorage full
  }
}

// --- Series ---

export function getAllSeries(): StoredSeries[] {
  const map = loadJson<SeriesMap>(SERIES_KEY, {});
  return Object.values(map).sort((a, b) => b.addedAt - a.addedAt);
}

export function getSeries(slug: string): StoredSeries | null {
  const map = loadJson<SeriesMap>(SERIES_KEY, {});
  return map[slug] ?? null;
}

export function saveSeries(series: StoredSeries) {
  const map = loadJson<SeriesMap>(SERIES_KEY, {});
  map[series.slug] = series;
  saveJson(SERIES_KEY, map);
}

export function deleteSeries(slug: string) {
  const map = loadJson<SeriesMap>(SERIES_KEY, {});
  delete map[slug];
  saveJson(SERIES_KEY, map);

  // Also delete chapters
  const chapters = loadJson<ChaptersMap>(CHAPTERS_KEY, {});
  delete chapters[slug];
  saveJson(CHAPTERS_KEY, chapters);
}

export function updateSeriesTotalChapters(slug: string, total: number) {
  const map = loadJson<SeriesMap>(SERIES_KEY, {});
  if (map[slug]) {
    map[slug].totalChapters = total;
    saveJson(SERIES_KEY, map);
  }
}

// --- Chapters ---

export function getChapters(slug: string): StoredChapter[] {
  const map = loadJson<ChaptersMap>(CHAPTERS_KEY, {});
  const chapterMap = map[slug] ?? {};
  return Object.values(chapterMap).sort((a, b) => a.number - b.number);
}

export function getChapter(slug: string, num: number): StoredChapter | null {
  const map = loadJson<ChaptersMap>(CHAPTERS_KEY, {});
  return map[slug]?.[num] ?? null;
}

export function saveChapter(slug: string, chapter: StoredChapter) {
  const map = loadJson<ChaptersMap>(CHAPTERS_KEY, {});
  if (!map[slug]) map[slug] = {};
  map[slug][chapter.number] = chapter;
  saveJson(CHAPTERS_KEY, map);
}

export function saveChapters(slug: string, chapters: StoredChapter[]) {
  const map = loadJson<ChaptersMap>(CHAPTERS_KEY, {});
  if (!map[slug]) map[slug] = {};
  for (const ch of chapters) {
    map[slug][ch.number] = ch;
  }
  saveJson(CHAPTERS_KEY, map);
}

export function getSyncedChapterCount(slug: string): number {
  const chapters = getChapters(slug);
  return chapters.filter((ch) => ch.imageUrls.length > 0).length;
}

export function getUnsyncedChapters(slug: string): StoredChapter[] {
  return getChapters(slug).filter((ch) => ch.imageUrls.length === 0);
}
```

**Step 2: Commit**

```bash
git add src/lib/manga-store.ts
git commit -m "feat: add localStorage-based manga store for series and chapters"
```

---

### Task 3: Create Client-Side Scraper

**Files:**
- Create: `src/lib/scraper.ts`

**Step 1: Create the scraper module**

This module handles all HTTP-based scraping via the proxy endpoint. It uses DOMParser to parse HTML responses.

```typescript
// src/lib/scraper.ts
const PROXY_BASE = "/api/proxy?url=";
const REQUEST_DELAY = 1500; // 1.5s between requests

function proxyUrl(url: string): string {
  return PROXY_BASE + encodeURIComponent(url);
}

async function fetchHtml(url: string): Promise<Document> {
  const resp = await fetch(proxyUrl(url));
  if (!resp.ok) throw new Error(`Failed to fetch: ${resp.status}`);
  const text = await resp.text();
  const parser = new DOMParser();
  return parser.parseFromString(text, "text/html");
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Series Discovery ---

export interface DiscoveredSeries {
  title: string;
  coverUrl: string;
  sourceUrl: string;
  firstChapterUrl: string | null;
  latestChapterUrl: string | null;
}

export async function discoverSeries(seriesUrl: string): Promise<DiscoveredSeries> {
  const doc = await fetchHtml(seriesUrl);

  // Title: <h1> or meta og:title
  const titleEl = doc.querySelector("h1");
  const title = titleEl?.textContent?.trim() || doc.querySelector('meta[property="og:title"]')?.getAttribute("content") || "Unknown";

  // Cover: og:image or first large image
  const coverUrl = doc.querySelector('meta[property="og:image"]')?.getAttribute("content") || "";

  // Find chapter links — look for links containing "/chapter-"
  const allLinks = Array.from(doc.querySelectorAll('a[href*="/chapter-"]'));
  const chapterUrls: string[] = [];
  for (const link of allLinks) {
    const href = link.getAttribute("href");
    if (href && href.includes("/chapter-")) {
      const fullUrl = href.startsWith("http") ? href : `https://manhwazone.to${href}`;
      chapterUrls.push(fullUrl);
    }
  }

  // Deduplicate
  const unique = [...new Set(chapterUrls)];

  // Sort by chapter number (extract number from URL)
  unique.sort((a, b) => {
    const numA = extractChapterNum(a);
    const numB = extractChapterNum(b);
    return numA - numB;
  });

  return {
    title,
    coverUrl,
    sourceUrl: seriesUrl,
    firstChapterUrl: unique[0] || null,
    latestChapterUrl: unique[unique.length - 1] || null,
  };
}

function extractChapterNum(url: string): number {
  const match = url.match(/chapter-(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

// --- Chapter Discovery (follow prev/next links) ---

export interface DiscoveredChapter {
  number: number;
  title: string;
  url: string;
}

export async function discoverAllChapters(
  firstChapterUrl: string,
  onProgress?: (discovered: number) => void,
  signal?: AbortSignal
): Promise<DiscoveredChapter[]> {
  const chapters: DiscoveredChapter[] = [];
  const visited = new Set<string>();
  let currentUrl: string | null = firstChapterUrl;

  while (currentUrl && !signal?.aborted) {
    if (visited.has(currentUrl)) break;
    visited.add(currentUrl);

    try {
      const doc = await fetchHtml(currentUrl);

      // Extract chapter number and title
      const num = extractChapterNum(currentUrl);
      const titleEl = doc.querySelector("h1") || doc.querySelector(".chapter-title");
      const title = titleEl?.textContent?.trim() || `Chapter ${num}`;

      chapters.push({ number: num, title, url: currentUrl });
      onProgress?.(chapters.length);

      // Find "next" link
      const nextLink = doc.querySelector('link[rel="next"]')?.getAttribute("href")
        || doc.querySelector('a[rel="next"]')?.getAttribute("href")
        || findNextChapterLink(doc, num);

      if (nextLink) {
        currentUrl = nextLink.startsWith("http") ? nextLink : `https://manhwazone.to${nextLink}`;
      } else {
        currentUrl = null;
      }

      // Polite delay
      if (currentUrl) await delay(REQUEST_DELAY);
    } catch {
      // If a single chapter fails, stop discovery
      break;
    }
  }

  return chapters.sort((a, b) => a.number - b.number);
}

function findNextChapterLink(doc: Document, currentNum: number): string | null {
  // Look for links to chapter-(currentNum+1)
  const nextNum = currentNum + 1;
  const links = doc.querySelectorAll(`a[href*="chapter-${nextNum}"]`);
  for (const link of links) {
    const href = link.getAttribute("href");
    if (href && href.includes(`chapter-${nextNum}`)) {
      return href;
    }
  }

  // Also try matching a "next" button by text content
  const allLinks = doc.querySelectorAll("a");
  for (const link of allLinks) {
    const text = link.textContent?.trim().toLowerCase() || "";
    const href = link.getAttribute("href") || "";
    if ((text === "next" || text === "next chapter" || text.includes("▶") || text.includes("→")) && href.includes("chapter-")) {
      return href;
    }
  }

  return null;
}

// --- Chapter Image Scraping ---

export async function scrapeChapterImages(chapterUrl: string): Promise<string[]> {
  const doc = await fetchHtml(chapterUrl);

  // Strategy 1: Look for images in chapter reading section
  // manhwazone.to uses <figure> with <img data-src="..."> inside aria-label="Chapter pages"
  const chapterSection = doc.querySelector('section[aria-label="Chapter pages"]') || doc.querySelector(".reading-content") || doc.body;

  const images: string[] = [];
  const imgElements = chapterSection.querySelectorAll("img");

  for (const img of imgElements) {
    // Prefer data-src (lazy-loaded real URL) over src (placeholder)
    const src = img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("src") || "";

    // Skip placeholder images and non-content images
    if (!src || src.includes("1x1.webp") || src.includes("loading") || src.includes("pixel") || src.includes("data:image")) {
      continue;
    }

    // Only include actual manga page images (from known CDN or large images)
    if (src.includes("manhwatop.com") || src.includes("manhwazone.to/uploads") || isLikelyMangaImage(src)) {
      images.push(src);
    }
  }

  return images;
}

function isLikelyMangaImage(src: string): boolean {
  // Filter out known non-content patterns
  const skipPatterns = [
    /logo/i, /banner/i, /icon/i, /avatar/i, /ads?[_-]/i, /sponsor/i,
    /badge/i, /button/i, /arrow/i, /social/i, /favicon/i, /thumb/i,
  ];
  return !skipPatterns.some((p) => p.test(src));
}
```

**Step 2: Commit**

```bash
git add src/lib/scraper.ts
git commit -m "feat: add client-side HTML scraper using DOMParser"
```

---

### Task 4: Convert Home Page to Client Component

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Rewrite page.tsx as client component**

The current page is a server component that fetches from MongoDB. Convert it to a client component that reads from localStorage.

Replace the entire file. Key changes:
- Remove `connectDB`, `Series` model imports
- Add `"use client"` directive
- Load series from `getAllSeries()` in a `useEffect`
- Replace MongoDB document fields with `StoredSeries` fields

```typescript
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import { getAllSeries, type StoredSeries } from "@/lib/manga-store";
import { SeriesCard } from "@/components/SeriesCard";
import { ContinueReading } from "@/components/ContinueReading";

export default function LibraryPage() {
  const [series, setSeries] = useState<StoredSeries[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSeries(getAllSeries());
    setLoaded(true);
  }, []);

  if (!loaded) return null;

  const isEmpty = series.length === 0;

  return (
    <div className={styles.page}>
      {/* --- header stays exactly the same (lines 19-82) --- */}
      <header className={styles.header}>
        {/* ... keep existing header JSX unchanged ... */}
      </header>

      {!isEmpty && (
        <ContinueReading
          series={series.map((s) => ({
            slug: s.slug,
            title: s.title,
            coverUrl: s.coverUrl || "",
            totalChapters: s.totalChapters,
          }))}
        />
      )}

      {/* --- empty state stays exactly the same (lines 96-153) --- */}

      {isEmpty ? (
        <div className={styles.empty}>
          {/* ... keep existing empty state SVG unchanged ... */}
        </div>
      ) : (
        <div className={styles.grid}>
          {series.map((s) => (
            <SeriesCard
              key={s.slug}
              slug={s.slug}
              title={s.title}
              coverUrl={s.coverUrl}
              totalChapters={s.totalChapters}
            />
          ))}
        </div>
      )}

      {/* --- FAB stays the same --- */}
      <Link
        href="/add"
        className={isEmpty ? styles.fabPulse : styles.fab}
        aria-label="Serie hinzufuegen"
      >
        +
      </Link>
    </div>
  );
}
```

Note: The full implementation should preserve all the existing SVG/header JSX exactly. Only the data-fetching logic and component signature changes.

**Step 2: Update SeriesCard to remove server-only props**

Remove `crawledChapters` and `status` props since we no longer track those server-side. The synced count comes from localStorage chapters.

In `src/components/SeriesCard.tsx`:
- Remove `crawledChapters` and `status` props
- Remove the "Discovering" badge (status is no longer tracked)
- Keep everything else

**Step 3: Remove `export const dynamic = "force-dynamic"` from page.tsx**

**Step 4: Commit**

```bash
git add src/app/page.tsx src/components/SeriesCard.tsx
git commit -m "feat: convert home page to client component using localStorage"
```

---

### Task 5: Update Add Series Page

**Files:**
- Modify: `src/app/add/page.tsx`

**Step 1: Rewrite handleSubmit to use client-side scraping**

Replace the `POST /api/series` call with direct client-side scraping:

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!url.trim()) return;

  setLoading(true);
  setError(null);

  try {
    const discovered = await discoverSeries(url.trim());

    // Generate slug from title
    const slug = discovered.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Save to localStorage
    saveSeries({
      slug,
      title: discovered.title,
      coverUrl: discovered.coverUrl,
      sourceUrl: discovered.sourceUrl,
      totalChapters: 0, // Will be updated during chapter discovery
      addedAt: Date.now(),
    });

    router.push(`/series/${slug}`);
  } catch {
    setError("Fehler beim Laden der Serie. Ist die URL korrekt?");
  } finally {
    setLoading(false);
  }
};
```

Add imports: `import { discoverSeries } from "@/lib/scraper"` and `import { saveSeries } from "@/lib/manga-store"`.

**Step 2: Update loading hint text**

Change line 109 from "Die Serie wird gecrawlt. Dies kann 10-20 Sekunden dauern..." to "Serie wird geladen..."

**Step 3: Commit**

```bash
git add src/app/add/page.tsx
git commit -m "feat: add series via client-side scraping instead of server API"
```

---

### Task 6: Convert Series Detail Page to Client Component

**Files:**
- Modify: `src/app/series/[slug]/page.tsx`

**Step 1: Rewrite as client component**

Replace the server component with a client component that reads from localStorage:

```typescript
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSeries, getChapters, type StoredSeries, type StoredChapter } from "@/lib/manga-store";
import { ChapterList } from "@/components/ChapterList";
import { DeleteSeriesButton } from "./DeleteSeriesButton";
import styles from "./page.module.css";
import Link from "next/link";

export default function SeriesPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [series, setSeries] = useState<StoredSeries | null>(null);
  const [chapters, setChapters] = useState<StoredChapter[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const s = getSeries(slug);
    if (!s) {
      router.push("/");
      return;
    }
    setSeries(s);
    setChapters(getChapters(slug));
    setLoaded(true);
  }, [slug, router]);

  if (!loaded || !series) return null;

  const syncedCount = chapters.filter((ch) => ch.imageUrls.length > 0).length;

  const chaptersPlain = chapters.map((ch) => ({
    number: ch.number,
    title: ch.title,
    status: ch.imageUrls.length > 0 ? "crawled" : "pending",
    pageCount: ch.imageUrls.length,
  }));

  return (
    <div className={styles.page}>
      {/* Keep existing header JSX */}
      <header className={styles.header}>
        <Link href="/" className={styles.backBtn} aria-label="Zurueck">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <h1 className={styles.headerTitle}>{series.title}</h1>
      </header>

      {/* Series info card */}
      <div className={styles.infoCard}>
        {series.coverUrl ? (
          <img
            src={`/api/proxy?url=${encodeURIComponent(series.coverUrl)}`}
            alt={series.title}
            className={styles.cover}
          />
        ) : (
          <div className={styles.coverPlaceholder}>&#9744;</div>
        )}

        <div className={styles.details}>
          <h2 className={styles.seriesTitle}>{series.title}</h2>
          <div className={styles.badges}>
            <span className={styles.badge}>
              {series.totalChapters || chapters.length} Kapitel
            </span>
            <span className={`${styles.badge} ${styles.badgeCrawled}`}>
              {syncedCount} bereit
            </span>
          </div>
        </div>
      </div>

      {/* Delete button */}
      <div className={styles.dangerZone}>
        <DeleteSeriesButton seriesSlug={slug} seriesTitle={series.title} />
      </div>

      {/* Chapter list */}
      <ChapterList
        chapters={chaptersPlain}
        seriesSlug={slug}
      />
    </div>
  );
}
```

**Step 2: Remove `export const dynamic = "force-dynamic"` and the `Props` interface.**

**Step 3: Commit**

```bash
git add src/app/series/[slug]/page.tsx
git commit -m "feat: convert series page to client component using localStorage"
```

---

### Task 7: Rewrite ChapterList Sync Logic

**Files:**
- Modify: `src/components/ChapterList.tsx`

**Step 1: Replace server sync with client-side scraping**

The sync handler now:
1. Discovers chapters via prev/next link crawling (if not yet discovered)
2. Scrapes image URLs for each unsynced chapter
3. Stores results in localStorage
4. Shows progress in real-time

Key changes to `handleSync`:

```typescript
import { discoverAllChapters, scrapeChapterImages } from "@/lib/scraper";
import {
  getSeries, getChapters, saveChapters, saveChapter,
  getUnsyncedChapters, updateSeriesTotalChapters,
  type StoredChapter,
} from "@/lib/manga-store";
```

Remove `seriesId` prop (no longer needed). Add new state:

```typescript
const [syncAbort, setSyncAbort] = useState<AbortController | null>(null);
```

Replace `handleSync`:

```typescript
const handleSync = useCallback(async () => {
  setSyncing(true);
  const abort = new AbortController();
  setSyncAbort(abort);

  try {
    const series = getSeries(seriesSlug);
    if (!series) return;

    let localChapters = getChapters(seriesSlug);

    // Phase 1: Discover chapters if we don't have any
    if (localChapters.length === 0 && series.sourceUrl) {
      // First, discover the series to get the first chapter URL
      const { discoverSeries } = await import("@/lib/scraper");
      const discovered = await discoverSeries(series.sourceUrl);

      if (discovered.firstChapterUrl) {
        setSyncProgress({ completed: 0, total: 0 });

        const discoveredChapters = await discoverAllChapters(
          discovered.firstChapterUrl,
          (count) => setSyncProgress({ completed: 0, total: count }),
          abort.signal
        );

        // Save discovered chapters (without images yet)
        const toSave: StoredChapter[] = discoveredChapters.map((ch) => ({
          number: ch.number,
          title: ch.title,
          url: ch.url,
          imageUrls: [],
          syncedAt: null,
        }));
        saveChapters(seriesSlug, toSave);
        updateSeriesTotalChapters(seriesSlug, toSave.length);
        localChapters = toSave;
      }
    }

    // Phase 2: Scrape images for unsynced chapters
    const unsynced = localChapters.filter((ch) => ch.imageUrls.length === 0);
    const total = localChapters.length;
    const alreadySynced = total - unsynced.length;

    setSyncProgress({ completed: alreadySynced, total });

    for (let i = 0; i < unsynced.length; i++) {
      if (abort.signal.aborted) break;

      const ch = unsynced[i];
      try {
        const imageUrls = await scrapeChapterImages(ch.url);
        saveChapter(seriesSlug, { ...ch, imageUrls, syncedAt: Date.now() });
        setSyncProgress({ completed: alreadySynced + i + 1, total });
      } catch {
        // Skip failed chapter, continue with next
      }

      // Polite delay between chapters
      if (i < unsynced.length - 1 && !abort.signal.aborted) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    // Reload the page to show updated data
    window.location.reload();
  } catch {
    // Aborted or failed
  } finally {
    setSyncing(false);
    setSyncProgress(null);
    setSyncAbort(null);
  }
}, [seriesSlug]);
```

Add a stop handler:

```typescript
const handleStopSync = useCallback(() => {
  syncAbort?.abort();
}, [syncAbort]);
```

Update the sync button to show "Stop" when syncing:

```html
<button
  className={styles.syncBtn}
  onClick={syncing ? handleStopSync : handleSync}
  type="button"
>
  {syncing ? "Stop" : "Sync All"}
</button>
```

**Step 2: Remove `seriesId` from the Props interface**

Update to:
```typescript
interface Props {
  chapters: ChapterItem[];
  seriesSlug: string;
}
```

Remove `seriesId` from destructuring.

**Step 3: Commit**

```bash
git add src/components/ChapterList.tsx
git commit -m "feat: rewrite ChapterList sync with client-side scraping"
```

---

### Task 8: Rewrite Reader Page

**Files:**
- Modify: `src/app/read/[slug]/[chapter]/page.tsx`

**Step 1: Replace server API calls with localStorage reads**

The reader page currently:
1. Fetches chapter list from `/api/series/{slug}` (for navigation)
2. Fetches chapter data from `/api/chapters/{id}` (for images)
3. Triggers crawl via `POST /api/chapters/{id}` if not crawled
4. Polls for crawl completion

Replace all of this with localStorage reads + on-demand client scraping:

```typescript
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Reader from "@/components/reader/Reader";
import { getChapters, getChapter, saveChapter } from "@/lib/manga-store";
import { scrapeChapterImages } from "@/lib/scraper";
import styles from "./page.module.css";

export default function ReaderPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const chapterNum = parseInt(params.chapter as string, 10);

  const [imageUrls, setImageUrls] = useState<string[] | null>(null);
  const [chapterTitle, setChapterTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allChapterNums, setAllChapterNums] = useState<number[]>([]);

  // Load chapter list for navigation
  useEffect(() => {
    const chapters = getChapters(slug);
    setAllChapterNums(chapters.map((ch) => ch.number).sort((a, b) => a - b));
  }, [slug]);

  // Load current chapter
  const fetchChapter = useCallback(async () => {
    setLoading(true);
    setError(null);

    const ch = getChapter(slug, chapterNum);
    if (!ch) {
      setError("Kapitel nicht gefunden.");
      setLoading(false);
      return;
    }

    setChapterTitle(ch.title);

    // Already synced — show immediately
    if (ch.imageUrls.length > 0) {
      setImageUrls(ch.imageUrls);
      setLoading(false);
      return;
    }

    // Not synced — scrape on-demand
    try {
      const images = await scrapeChapterImages(ch.url);
      if (images.length > 0) {
        saveChapter(slug, { ...ch, imageUrls: images, syncedAt: Date.now() });
        setImageUrls(images);
      } else {
        setError("Keine Bilder gefunden.");
      }
    } catch {
      setError("Fehler beim Laden der Bilder.");
    } finally {
      setLoading(false);
    }
  }, [slug, chapterNum]);

  useEffect(() => {
    fetchChapter();
  }, [fetchChapter]);

  const currentIndex = allChapterNums.indexOf(chapterNum);
  const prevChapter = currentIndex > 0 ? allChapterNums[currentIndex - 1] : null;
  const nextChapter = currentIndex < allChapterNums.length - 1 ? allChapterNums[currentIndex + 1] : null;

  const goToChapter = (num: number) => {
    setImageUrls(null);
    setLoading(true);
    setError(null);
    router.push(`/read/${slug}/${num}`);
  };

  // Loading state — keep existing spinner JSX
  if (loading && !imageUrls) {
    return (
      <div className={styles.loading}>
        {/* Keep existing spinner SVG */}
        <p>Kapitel wird geladen...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.loading}>
        <p className={styles.errorText}>{error}</p>
        <button className={styles.retryBtn} onClick={fetchChapter}>
          Erneut versuchen
        </button>
        <button
          className={styles.retryBtn}
          onClick={() => router.back()}
          style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
        >
          Zurueck
        </button>
      </div>
    );
  }

  if (!imageUrls || imageUrls.length === 0) {
    return (
      <div className={styles.loading}>
        <p>Keine Bilder gefunden.</p>
        <button className={styles.retryBtn} onClick={fetchChapter}>
          Erneut versuchen
        </button>
      </div>
    );
  }

  return (
    <Reader
      slug={slug}
      chapterNumber={chapterNum}
      title={chapterTitle}
      imageUrls={imageUrls}
      prevChapter={prevChapter}
      nextChapter={nextChapter}
      allChapterNums={allChapterNums}
      onNavigate={goToChapter}
    />
  );
}
```

This removes:
- All polling logic
- All `/api/chapters/` and `/api/series/` calls
- The `chapterIds` mapping (we use chapter numbers directly now)
- The `crawling` state (scraping is instant client-side)

**Step 2: Commit**

```bash
git add src/app/read/[slug]/[chapter]/page.tsx
git commit -m "feat: reader page uses localStorage + on-demand client scraping"
```

---

### Task 9: Update DeleteSeriesButton

**Files:**
- Modify: `src/app/series/[slug]/DeleteSeriesButton.tsx`

**Step 1: Replace API delete with localStorage delete**

```typescript
import { deleteSeries } from "@/lib/manga-store";
import { clearSeriesProgress } from "@/lib/reading-progress";

const handleDelete = async () => {
  setDeleting(true);
  deleteSeries(seriesSlug);
  clearSeriesProgress(seriesSlug);
  router.push("/");
};
```

Remove the `fetch` call to `/api/series/${seriesSlug}`.

**Step 2: Commit**

```bash
git add src/app/series/[slug]/DeleteSeriesButton.tsx
git commit -m "feat: delete series from localStorage instead of server API"
```

---

### Task 10: Update Image References

**Files:**
- Modify: `src/components/SeriesCard.tsx`
- Modify: `src/components/ContinueReading.tsx`
- Modify: `src/components/reader/Reader.tsx` (and sub-readers)

**Step 1: Change image proxy URL from `/api/img` to `/api/proxy`**

In all components that render images via the proxy, change:
- `/api/img?url=` → `/api/proxy?url=`

This applies to:
- `SeriesCard.tsx` line 39: cover image src
- `ContinueReading.tsx` line 83: cover image src
- All reader components that render chapter images

Check all reader sub-components for image URLs. The reader components receive `imageUrls` as props — these are raw CDN URLs. They need to be proxied.

In `src/components/reader/VerticalReader.tsx`, `PageReader.tsx`, `RtlReader.tsx`, `DoublePageReader.tsx`: find where `imageUrls[i]` is used as `src` and wrap it with the proxy:

```typescript
const proxyImage = (url: string) => `/api/proxy?url=${encodeURIComponent(url)}`;
```

Then use `proxyImage(imageUrls[i])` instead of `imageUrls[i]` or `/api/img?url=${encodeURIComponent(imageUrls[i])}`.

**Step 2: Commit**

```bash
git add src/components/
git commit -m "feat: use /api/proxy for all image loading"
```

---

### Task 11: Update Service Worker for Better Image Caching

**Files:**
- Modify: `public/sw.js`

**Step 1: Update the Service Worker**

Change the image cache intercept from `/api/img` to `/api/proxy`:

```javascript
// Line 60: Change from /api/img to /api/proxy for image caching
if (url.pathname === "/api/proxy" && url.searchParams.get("url")) {
  const targetUrl = url.searchParams.get("url");
  // Only cache image responses (not HTML)
  event.respondWith(
    caches.open(IMG_CACHE).then((cache) =>
      cache.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          const ct = response.headers.get("content-type") || "";
          // Only cache images, not HTML
          if (response.ok && (ct.startsWith("image/") || targetUrl.includes("manhwatop.com"))) {
            cache.put(event.request, response.clone());
            evictOldImages();
          }
          return response;
        });
      })
    )
  );
  return;
}
```

Also increase `MAX_IMG_CACHE` from 500 to 2000 for heavier offline usage.

**Step 2: Commit**

```bash
git add public/sw.js
git commit -m "feat: update service worker to cache images via /api/proxy"
```

---

### Task 12: Add Cache Management to Settings/Stats

**Files:**
- Modify: `src/app/stats/page.tsx`

**Step 1: Add "Offline Storage" section to the stats page**

Add a section below the reading stats that shows:
- List of series with cached chapter counts
- Button to clear cache per series
- Button to clear all cached data

```typescript
import { getAllSeries, deleteSeries, getChapters } from "@/lib/manga-store";

// In the component, add:
const [seriesList, setSeriesList] = useState<Array<{ slug: string; title: string; cachedCount: number }>>([]);

useEffect(() => {
  const all = getAllSeries();
  setSeriesList(all.map((s) => ({
    slug: s.slug,
    title: s.title,
    cachedCount: getChapters(s.slug).filter((ch) => ch.imageUrls.length > 0).length,
  })));
}, []);

const handleClearSeries = (slug: string) => {
  deleteSeries(slug);
  setSeriesList((prev) => prev.filter((s) => s.slug !== slug));
};

const handleClearAll = () => {
  for (const s of seriesList) {
    deleteSeries(s.slug);
  }
  setSeriesList([]);
};
```

Add the JSX section after the existing stats content:

```html
<section className={styles.seriesSection}>
  <h2 className={styles.seriesSectionTitle}>Offline-Speicher</h2>
  {seriesList.length === 0 ? (
    <p style={{ color: "var(--text-muted)", padding: "1rem" }}>Keine gespeicherten Serien</p>
  ) : (
    <>
      <div className={styles.seriesList}>
        {seriesList.map((s) => (
          <div key={s.slug} className={styles.seriesItem}>
            <div className={styles.seriesTop}>
              <span className={styles.seriesName}>{s.title}</span>
              <span className={styles.seriesDetail}>{s.cachedCount} Kapitel gecacht</span>
            </div>
            <button
              onClick={() => handleClearSeries(s.slug)}
              className={styles.actionBtn}
              style={{ marginTop: "0.5rem" }}
            >
              Cache loeschen
            </button>
          </div>
        ))}
      </div>
      <button onClick={handleClearAll} className={styles.actionBtn} style={{ marginTop: "1rem", background: "var(--error)" }}>
        Alles loeschen
      </button>
    </>
  )}
</section>
```

Add the `actionBtn` style to the stats CSS module.

**Step 2: Commit**

```bash
git add src/app/stats/page.tsx src/app/stats/page.module.css
git commit -m "feat: add cache management section to stats page"
```

---

### Task 13: Remove MongoDB, Puppeteer, and Old Server Code

**Files:**
- Delete: `src/lib/db.ts`
- Delete: `src/lib/crawler.ts`
- Delete: `src/lib/models/Series.ts`
- Delete: `src/lib/models/Chapter.ts`
- Delete: `src/lib/models/CrawlJob.ts`
- Delete: `src/app/api/series/route.ts`
- Delete: `src/app/api/series/[slug]/route.ts`
- Delete: `src/app/api/chapters/[id]/route.ts`
- Delete: `src/app/api/crawl/chapters/route.ts`
- Delete: `src/app/api/crawl/status/[seriesId]/route.ts`
- Delete: `src/app/api/img/route.ts` (replaced by /api/proxy)
- Delete: `netlify/functions/crawl-chapters-background.mts`
- Modify: `package.json` (remove dependencies)
- Modify: `next.config.ts` (remove serverExternalPackages)

**Step 1: Delete old files**

```bash
rm -f src/lib/db.ts src/lib/crawler.ts
rm -rf src/lib/models
rm -rf src/app/api/series
rm -rf src/app/api/chapters
rm -rf src/app/api/crawl
rm -f src/app/api/img/route.ts
rm -rf netlify/functions
```

**Step 2: Remove packages from package.json**

Remove these from `dependencies`:
- `@sparticuz/chromium-min`
- `mongoose`
- `puppeteer-core`
- `puppeteer-extra`
- `puppeteer-extra-plugin-stealth`

**Step 3: Update next.config.ts**

Remove the `serverExternalPackages` line (line 10).

**Step 4: Run npm install to update lockfile**

```bash
npm install
```

**Step 5: Verify build**

```bash
npm run build
```

Expected: Build succeeds with no imports of deleted modules.

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove MongoDB, Puppeteer, and all server-side crawling code"
```

---

### Task 14: Final Integration Test

**Step 1: Run dev server**

```bash
npm run dev
```

**Step 2: Manual test checklist**

- [ ] Home page loads (empty state if no series)
- [ ] Add series: paste `https://manhwazone.to/series/<any-series>` → discovers title + cover
- [ ] Series detail page shows series info
- [ ] Click "Sync All" → discovers chapters via prev/next, shows progress
- [ ] Stop sync works (click Stop)
- [ ] Re-click Sync All → only syncs remaining chapters
- [ ] Click a synced chapter → reader loads images
- [ ] Click an unsynced chapter → scrapes on-demand, then shows images
- [ ] Chapter navigation (prev/next) works
- [ ] Reading progress is tracked
- [ ] Stats page shows reading statistics
- [ ] Delete series works
- [ ] Cache management section shows in stats
- [ ] Images are cached by Service Worker (check DevTools > Application > Cache Storage)

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes after migration to client-side scraping"
```

---

## Summary

| Task | Description | Est. Files |
|------|-------------|------------|
| 1 | Create `/api/proxy` endpoint | 1 new |
| 2 | Create manga-store.ts (localStorage) | 1 new |
| 3 | Create scraper.ts (client-side) | 1 new |
| 4 | Convert home page to client component | 2 modified |
| 5 | Update add series page | 1 modified |
| 6 | Convert series detail page | 1 modified |
| 7 | Rewrite ChapterList sync | 1 modified |
| 8 | Rewrite reader page | 1 modified |
| 9 | Update DeleteSeriesButton | 1 modified |
| 10 | Update image references | 4+ modified |
| 11 | Update Service Worker | 1 modified |
| 12 | Add cache management | 2 modified |
| 13 | Remove old server code | 15+ deleted, 2 modified |
| 14 | Integration testing | fixes as needed |

## Future Phase (Not In This Plan)

- Complete UI overhaul with shadcn/ui + Catppuccin/Pastel Dreams theme
- Cozy anime aesthetic with subtle animations
