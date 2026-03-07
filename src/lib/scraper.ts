import type { MangaSource } from "./manga-store";
import { isNative } from "./platform";

const IMAGE_PROXY_BASE = "/api/proxy?url=";
const REQUEST_DELAY = 500;

// CF Worker proxy URL (set via NEXT_PUBLIC_CF_PROXY_URL env var)
const CF_PROXY_URL = process.env.NEXT_PUBLIC_CF_PROXY_URL || "";

// --- Image proxy URL ---

export function imageProxyUrl(url: string, source?: MangaSource): string {
  // Native app: load all images directly (no CORS)
  if (isNative()) {
    if (source === "atsumaru" && url.startsWith("/")) {
      return `https://atsu.moe${url}`;
    }
    return url;
  }

  // Web/PWA: proxy MangaDex images, others load directly
  if (source === "mangadex") {
    return `/api/mangadex/img?url=${encodeURIComponent(url)}`;
  }
  if (source === "atsumaru" && url.startsWith("/")) {
    return `https://atsu.moe${url}`;
  }
  return url;
}

// --- Source detection ---

export function detectSource(url: string): MangaSource {
  try {
    const hostname = new URL(url).hostname;
    if (hostname.includes("mangadex.org")) return "mangadex";
    if (hostname.includes("mangakatana.com")) return "mangakatana";
    if (hostname.includes("weebcentral.com")) return "weebcentral";
    if (hostname.includes("atsu.moe")) return "atsumaru";
    if (hostname.includes("mangabuddy.com")) return "mangabuddy";
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

// Sources with Access-Control-Allow-Origin: * — can be fetched directly from browser
const CORS_OPEN_HOSTS = ["mangabuddy.com", "www.mangabuddy.com"];

function isCorsOpen(url: string): boolean {
  try {
    return CORS_OPEN_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

async function fetchHtml(url: string): Promise<Document> {
  // Native app: fetch directly — Capacitor patches fetch() to bypass CORS
  if (isNative() || isCorsOpen(url)) {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
    const text = await resp.text();
    validateHtmlText(text);
    return new DOMParser().parseFromString(text, "text/html");
  }

  // Web/PWA: use server proxy chain (CORS restricted)
  const endpoints: ProxyEndpoint[] = [];
  if (CF_PROXY_URL) {
    endpoints.push({ url: CF_PROXY_URL + "?url=" + encodeURIComponent(url) });
  }
  endpoints.push({ url: "/api/scrape?url=" + encodeURIComponent(url) });
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
    case "weebcentral":
      return discoverSeriesWeebCentral(seriesUrl);
    case "atsumaru":
      return discoverSeriesAtsumaru(seriesUrl);
    case "mangabuddy":
      return discoverSeriesMangaBuddy(seriesUrl);
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
    case "weebcentral":
      return scrapeChapterImagesWeebCentral(chapterUrl);
    case "atsumaru":
      return scrapeChapterImagesAtsumaru(chapterUrl);
    case "mangabuddy":
      return scrapeChapterImagesMangaBuddy(chapterUrl);
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

  // New layout uses <figure><img data-src="..."> with images on hot.planeptune.us
  const images: string[] = [];
  const imgElements = doc.querySelectorAll("img");

  for (const img of imgElements) {
    const src = img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("src") || "";
    if (!src || src.includes("1x1.webp") || src.includes("fallback") || src.includes("loading") || src.includes("pixel") || src.includes("data:image")) {
      continue;
    }
    if (src.includes("hot.planeptune.us") || src.includes("manhwatop.com") || src.includes("manhwazone.to/uploads")) {
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
// WEEBCENTRAL
// ============================================================

function extractWeebCentralId(url: string): string {
  // https://weebcentral.com/series/{ULID}/Slug
  const parts = new URL(url).pathname.split("/");
  return parts[2] || "";
}

async function discoverSeriesWeebCentral(seriesUrl: string): Promise<DiscoveredSeries> {
  const doc = await fetchHtml(seriesUrl);
  const ulid = extractWeebCentralId(seriesUrl);

  const titleEl = doc.querySelector("h1");
  const title = titleEl?.textContent?.trim() || "Unknown";
  const coverUrl = `https://temp.compsci88.com/cover/normal/${ulid}.webp`;

  return {
    title,
    coverUrl,
    sourceUrl: seriesUrl,
    firstChapterUrl: null,
    latestChapterUrl: null,
    source: "weebcentral",
    sourceId: ulid,
  };
}

async function scrapeChapterImagesWeebCentral(chapterUrl: string): Promise<string[]> {
  // WeebCentral loads images via HTMX: /chapters/{ULID}/images?reading_style=long_strip
  let chapterId = chapterUrl;
  if (chapterId.startsWith("weebcentral:")) {
    chapterId = chapterId.replace("weebcentral:", "");
  } else if (chapterId.includes("weebcentral.com/chapters/")) {
    chapterId = new URL(chapterId).pathname.split("/")[2] || "";
  }

  const resp = await fetch(`/api/scrape?url=${encodeURIComponent(`https://weebcentral.com/chapters/${chapterId}/images?is_prev=False&current_page=1&reading_style=long_strip`)}`);
  if (!resp.ok) throw new Error(`WeebCentral images fetch failed: ${resp.status}`);
  const html = await resp.text();

  const images: string[] = [];
  const imgRe = /src="(https:\/\/hot\.planeptune\.us\/[^"]+)"/gi;
  let m;
  while ((m = imgRe.exec(html)) !== null) {
    if (!images.includes(m[1])) images.push(m[1]);
  }
  return images;
}

// ============================================================
// ATSUMARU
// ============================================================

async function discoverSeriesAtsumaru(seriesUrl: string): Promise<DiscoveredSeries> {
  const mangaId = new URL(seriesUrl).pathname.split("/").pop() || "";

  const resp = await fetch(`https://atsu.moe/api/manga/page?id=${mangaId}`);
  if (!resp.ok) throw new Error(`Atsumaru series fetch failed: ${resp.status}`);
  const data = await resp.json();
  const manga = data.mangaPage;

  const poster = manga.poster;
  const coverUrl = poster?.mediumImage
    ? `https://atsu.moe/${poster.mediumImage}`
    : poster?.smallImage
      ? `https://atsu.moe/${poster.smallImage}`
      : "";

  return {
    title: manga.englishTitle || manga.title || "Unknown",
    coverUrl,
    sourceUrl: seriesUrl,
    firstChapterUrl: null,
    latestChapterUrl: null,
    source: "atsumaru",
    sourceId: mangaId,
  };
}

async function scrapeChapterImagesAtsumaru(chapterIdOrUrl: string): Promise<string[]> {
  // chapterIdOrUrl is stored as "atsumaru:{mangaId}:{chapterId}"
  let mangaId = "";
  let chapterId = "";

  if (chapterIdOrUrl.startsWith("atsumaru:")) {
    const parts = chapterIdOrUrl.replace("atsumaru:", "").split(":");
    mangaId = parts[0];
    chapterId = parts[1];
  }

  const resp = await fetch(`https://atsu.moe/api/read/chapter?mangaId=${mangaId}&chapterId=${chapterId}`);
  if (!resp.ok) throw new Error(`Atsumaru chapter fetch failed: ${resp.status}`);
  const data = await resp.json();
  const pages = data.readChapter?.pages || [];

  return pages.map((p: { image: string }) => {
    const img = p.image;
    return img.startsWith("/") ? `https://atsu.moe${img}` : img;
  });
}

// ============================================================
// MANGABUDDY
// ============================================================

async function discoverSeriesMangaBuddy(seriesUrl: string): Promise<DiscoveredSeries> {
  const doc = await fetchHtml(seriesUrl);

  const titleEl = doc.querySelector("h1");
  const title = titleEl?.textContent?.trim() || "Unknown";
  const coverImg = doc.querySelector('meta[property="og:image"]')?.getAttribute("content") || "";

  return {
    title,
    coverUrl: coverImg,
    sourceUrl: seriesUrl,
    firstChapterUrl: null,
    latestChapterUrl: null,
    source: "mangabuddy",
  };
}

async function scrapeChapterImagesMangaBuddy(chapterUrl: string): Promise<string[]> {
  const doc = await fetchHtml(chapterUrl);

  // MangaBuddy stores images in: var chapImages = 'url1,url2,...'
  const scripts = doc.querySelectorAll("script");
  for (const script of scripts) {
    const text = script.textContent || "";
    const match = text.match(/var\s+chapImages\s*=\s*'([^']+)'/);
    if (match) {
      return match[1].split(",").filter((u) => u.startsWith("http"));
    }
  }
  return [];
}

