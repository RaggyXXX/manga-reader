import type { MangaSource } from "./manga-store";

const IMAGE_PROXY_BASE = "/api/proxy?url=";
const REQUEST_DELAY = 500;

// CF Worker proxy URL (set via NEXT_PUBLIC_CF_PROXY_URL env var)
const CF_PROXY_URL = process.env.NEXT_PUBLIC_CF_PROXY_URL || "";

// --- Image proxy URL ---

export function imageProxyUrl(url: string, source?: MangaSource): string {
  if (source === "mangadex") {
    return `/api/mangadex/img?url=${encodeURIComponent(url)}`;
  }
  // Other sources: browser loads directly (real TLS fingerprint passes CF)
  return url;
}

// --- Source detection ---

export function detectSource(url: string): MangaSource {
  try {
    const hostname = new URL(url).hostname;
    if (hostname.includes("mangadex.org")) return "mangadex";
    if (hostname.includes("mangakatana.com")) return "mangakatana";
    if (hostname.includes("vymanga.com")) return "vymanga";
    if (hostname.includes("manhwazone.to")) return "manhwazone";
  } catch {
    // invalid URL
  }
  return "manhwazone"; // default fallback
}

// --- HTML fetching helpers ---

function validateHtmlText(text: string): void {
  if (!text || text.length < 200) {
    throw new Error("Proxy returned empty/short response");
  }
  const head = text.slice(0, 500);
  if (!head.includes("<html") && !head.includes("<!DOCTYPE") && !head.includes("<!doctype")) {
    throw new Error("Proxy returned non-HTML (possible Cloudflare challenge)");
  }
  if (head.includes("<title>Just a moment") || head.includes("cf-challenge") || head.includes("<title>Attention Required")) {
    throw new Error("Proxy returned Cloudflare challenge page");
  }
}

interface ProxyEndpoint {
  url: string;
  json?: boolean;
}

async function fetchHtml(url: string): Promise<Document> {
  const endpoints: ProxyEndpoint[] = [];
  if (CF_PROXY_URL) {
    endpoints.push({ url: CF_PROXY_URL + "?url=" + encodeURIComponent(url) });
  }
  endpoints.push({ url: "/api/scrape?url=" + encodeURIComponent(url) });
  endpoints.push({ url: "https://proxy.corsfix.com/?" + url });
  endpoints.push({ url: "https://every-origin.vercel.app/get?url=" + encodeURIComponent(url), json: true });
  endpoints.push({ url: IMAGE_PROXY_BASE + encodeURIComponent(url) });

  let lastError: Error | null = null;
  for (const endpoint of endpoints) {
    try {
      const resp = await fetch(endpoint.url);
      if (!resp.ok) {
        lastError = new Error(`Proxy returned ${resp.status}`);
        continue;
      }
      let text: string;
      if (endpoint.json) {
        const data = await resp.json();
        text = data.contents;
      } else {
        text = await resp.text();
      }
      validateHtmlText(text);
      return new DOMParser().parseFromString(text, "text/html");
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError || new Error("All proxies failed");
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Series Discovery (common interface) ---

export interface DiscoveredSeries {
  title: string;
  coverUrl: string;
  sourceUrl: string;
  firstChapterUrl: string | null;
  latestChapterUrl: string | null;
  source: MangaSource;
  sourceId?: string;
}

export async function discoverSeries(seriesUrl: string): Promise<DiscoveredSeries> {
  const source = detectSource(seriesUrl);
  switch (source) {
    case "mangadex":
      return discoverSeriesMangadex(seriesUrl);
    case "mangakatana":
      return discoverSeriesMangakatana(seriesUrl);
    case "vymanga":
      return discoverSeriesVymanga(seriesUrl);
    default:
      return discoverSeriesManhwazone(seriesUrl);
  }
}

// --- Chapter Image Scraping (common interface) ---

export async function scrapeChapterImages(chapterUrl: string, source?: MangaSource): Promise<string[]> {
  const s = source || detectSource(chapterUrl);
  switch (s) {
    case "mangadex":
      return scrapeChapterImagesMangadex(chapterUrl);
    case "mangakatana":
      return scrapeChapterImagesMangakatana(chapterUrl);
    case "vymanga":
      return scrapeChapterImagesVymanga(chapterUrl);
    default:
      return scrapeChapterImagesManhwazone(chapterUrl);
  }
}

// ============================================================
// MANHWAZONE
// ============================================================

async function discoverSeriesManhwazone(seriesUrl: string): Promise<DiscoveredSeries> {
  const doc = await fetchHtml(seriesUrl);

  const titleEl = doc.querySelector("h1");
  const title = titleEl?.textContent?.trim() || doc.querySelector('meta[property="og:title"]')?.getAttribute("content") || "Unknown";
  const coverUrl = doc.querySelector('meta[property="og:image"]')?.getAttribute("content") || "";

  const allLinks = Array.from(doc.querySelectorAll('a[href*="/chapter-"]'));
  const chapterUrls: string[] = [];
  for (const link of allLinks) {
    const href = link.getAttribute("href");
    if (href && href.includes("/chapter-")) {
      const fullUrl = href.startsWith("http") ? href : `https://manhwazone.to${href}`;
      chapterUrls.push(fullUrl);
    }
  }

  const unique = [...new Set(chapterUrls)];
  unique.sort((a, b) => extractChapterNumManhwazone(a) - extractChapterNumManhwazone(b));

  return {
    title,
    coverUrl,
    sourceUrl: seriesUrl,
    firstChapterUrl: unique[0] || null,
    latestChapterUrl: unique[unique.length - 1] || null,
    source: "manhwazone",
  };
}

function extractChapterNumManhwazone(url: string): number {
  const match = url.match(/chapter-(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

export interface DiscoveredChapter {
  number: number;
  title: string;
  url: string;
}

export async function discoverAllChapters(
  firstChapterUrl: string,
  onProgress?: (discovered: number, chapter?: DiscoveredChapter) => void,
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

      const num = extractChapterNumManhwazone(currentUrl);
      const titleEl = doc.querySelector("h1") || doc.querySelector(".chapter-title");
      const title = titleEl?.textContent?.trim() || `Chapter ${num}`;

      const chapter = { number: num, title, url: currentUrl };
      chapters.push(chapter);
      onProgress?.(chapters.length, chapter);

      const nextLink = doc.querySelector('link[rel="next"]')?.getAttribute("href")
        || doc.querySelector('a[rel="next"]')?.getAttribute("href")
        || findNextChapterLink(doc, num);

      if (nextLink) {
        currentUrl = nextLink.startsWith("http") ? nextLink : `https://manhwazone.to${nextLink}`;
      } else {
        currentUrl = null;
      }

      if (currentUrl) await delay(REQUEST_DELAY);
    } catch {
      break;
    }
  }

  return chapters.sort((a, b) => a.number - b.number);
}

function findNextChapterLink(doc: Document, currentNum: number): string | null {
  const nextNum = currentNum + 1;
  const links = doc.querySelectorAll(`a[href*="chapter-${nextNum}"]`);
  for (const link of links) {
    const href = link.getAttribute("href");
    if (href && href.includes(`chapter-${nextNum}`)) {
      return href;
    }
  }

  const allLinks = doc.querySelectorAll("a");
  for (const link of allLinks) {
    const text = link.textContent?.trim().toLowerCase() || "";
    const href = link.getAttribute("href") || "";
    if ((text === "next" || text === "next chapter" || text.includes("\u25b6") || text.includes("\u2192")) && href.includes("chapter-")) {
      return href;
    }
  }

  return null;
}

async function scrapeChapterImagesManhwazone(chapterUrl: string): Promise<string[]> {
  const doc = await fetchHtml(chapterUrl);

  const chapterSection = doc.querySelector('section[aria-label="Chapter pages"]') || doc.querySelector(".reading-content") || doc.body;
  const images: string[] = [];
  const imgElements = chapterSection.querySelectorAll("img");

  for (const img of imgElements) {
    const src = img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("src") || "";
    if (!src || src.includes("1x1.webp") || src.includes("fallback") || src.includes("loading") || src.includes("pixel") || src.includes("data:image")) {
      continue;
    }
    if (src.includes("manhwatop.com") || src.includes("manhwazone.to/uploads") || isLikelyMangaImage(src)) {
      images.push(src);
    }
  }

  return images;
}

function isLikelyMangaImage(src: string): boolean {
  const skipPatterns = [
    /logo/i, /banner/i, /icon/i, /avatar/i, /ads?[_-]/i, /sponsor/i,
    /badge/i, /button/i, /arrow/i, /social/i, /favicon/i, /thumb/i,
  ];
  return !skipPatterns.some((p) => p.test(src));
}

// ============================================================
// MANGADEX
// ============================================================

function extractMangadexId(url: string): string {
  // https://mangadex.org/title/{uuid}/optional-slug
  const parts = new URL(url).pathname.split("/");
  return parts[2] || "";
}

async function discoverSeriesMangadex(seriesUrl: string): Promise<DiscoveredSeries> {
  const mangaId = extractMangadexId(seriesUrl);
  if (!mangaId) throw new Error("Invalid MangaDex URL — no manga ID found");

  const resp = await fetch(`/api/mangadex/series?id=${mangaId}`);
  if (!resp.ok) throw new Error(`MangaDex series fetch failed: ${resp.status}`);
  const data = await resp.json();

  return {
    title: data.title,
    coverUrl: data.coverUrl,
    sourceUrl: seriesUrl,
    firstChapterUrl: null,
    latestChapterUrl: null,
    source: "mangadex",
    sourceId: mangaId,
  };
}

async function scrapeChapterImagesMangadex(chapterIdOrUrl: string): Promise<string[]> {
  // chapterIdOrUrl is stored as "mangadex:{uuid}" or a full URL
  let chapterId = chapterIdOrUrl;
  if (chapterId.startsWith("mangadex:")) {
    chapterId = chapterId.replace("mangadex:", "");
  } else if (chapterId.includes("mangadex.org")) {
    chapterId = new URL(chapterId).pathname.split("/")[2] || "";
  }

  const resp = await fetch(`/api/mangadex/images?chapterId=${chapterId}`);
  if (!resp.ok) throw new Error(`MangaDex image fetch failed: ${resp.status}`);
  const data = await resp.json();
  return data.imageUrls || [];
}

// ============================================================
// MANGAKATANA
// ============================================================

async function discoverSeriesMangakatana(seriesUrl: string): Promise<DiscoveredSeries> {
  const doc = await fetchHtml(seriesUrl);

  const titleEl = doc.querySelector("h1.heading");
  const title = titleEl?.textContent?.trim() || doc.querySelector("h1")?.textContent?.trim() || "Unknown";
  const coverImg = doc.querySelector(".media .cover img") || doc.querySelector('img[alt*="manga"]');
  const coverUrl = coverImg?.getAttribute("src") || doc.querySelector('meta[property="og:image"]')?.getAttribute("content") || "";

  const allLinks = Array.from(doc.querySelectorAll('a[href*="/c"]'));
  const chapterUrls: string[] = [];
  for (const link of allLinks) {
    const href = link.getAttribute("href");
    if (href && /\/c\d/.test(href)) {
      const fullUrl = href.startsWith("http") ? href : `https://mangakatana.com${href}`;
      chapterUrls.push(fullUrl);
    }
  }

  const unique = [...new Set(chapterUrls)];
  unique.sort((a, b) => extractChapterNumMangakatana(a) - extractChapterNumMangakatana(b));

  return {
    title,
    coverUrl,
    sourceUrl: seriesUrl,
    firstChapterUrl: unique[0] || null,
    latestChapterUrl: unique[unique.length - 1] || null,
    source: "mangakatana",
  };
}

function extractChapterNumMangakatana(url: string): number {
  const match = url.match(/\/c(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

async function scrapeChapterImagesMangakatana(chapterUrl: string): Promise<string[]> {
  const doc = await fetchHtml(chapterUrl);
  // MangaKatana stores images in a JS variable: var thzq=[url1, url2, ...]
  const scripts = doc.querySelectorAll("script");
  for (const script of scripts) {
    const text = script.textContent || "";
    const match = text.match(/var\s+thzq\s*=\s*\[([^\]]+)\]/);
    if (match) {
      const urlsRaw = match[1];
      const urls = urlsRaw.match(/['"]([^'"]+)['"]/g);
      if (urls) {
        return urls.map((u) => u.replace(/['"]/g, ""));
      }
    }
  }
  return [];
}

// ============================================================
// VYMANGA
// ============================================================

async function discoverSeriesVymanga(seriesUrl: string): Promise<DiscoveredSeries> {
  const doc = await fetchHtml(seriesUrl);

  const titleEl = doc.querySelector("h1");
  const title = titleEl?.textContent?.trim() || doc.querySelector('meta[property="og:title"]')?.getAttribute("content") || "Unknown";
  const coverUrl = doc.querySelector('meta[property="og:image"]')?.getAttribute("content")
    || doc.querySelector(".detail-info img")?.getAttribute("src") || "";

  const allLinks = Array.from(doc.querySelectorAll('a[href*="chapter-"]'));
  const chapterUrls: string[] = [];
  for (const link of allLinks) {
    const href = link.getAttribute("href");
    if (href && href.includes("chapter-")) {
      const fullUrl = href.startsWith("http") ? href : `https://vymanga.com${href}`;
      chapterUrls.push(fullUrl);
    }
  }

  const unique = [...new Set(chapterUrls)];
  unique.sort((a, b) => extractChapterNumVymanga(a) - extractChapterNumVymanga(b));

  return {
    title,
    coverUrl,
    sourceUrl: seriesUrl,
    firstChapterUrl: unique[0] || null,
    latestChapterUrl: unique[unique.length - 1] || null,
    source: "vymanga",
  };
}

function extractChapterNumVymanga(url: string): number {
  const match = url.match(/chapter-(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

async function scrapeChapterImagesVymanga(chapterUrl: string): Promise<string[]> {
  const doc = await fetchHtml(chapterUrl);
  const images: string[] = [];
  const imgElements = doc.querySelectorAll("img");

  for (const img of imgElements) {
    const src = img.getAttribute("data-src") || img.getAttribute("src") || "";
    if (!src) continue;
    if (src.includes("cdnxyz.xyz") || src.includes("vycdn.net")) {
      images.push(src);
    }
  }

  return images;
}
