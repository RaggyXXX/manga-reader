const IMAGE_PROXY_BASE = "/api/proxy?url=";
const REQUEST_DELAY = 500;

// CF Worker proxy URL (set via NEXT_PUBLIC_CF_PROXY_URL env var)
const CF_PROXY_URL = process.env.NEXT_PUBLIC_CF_PROXY_URL || "";

export function imageProxyUrl(url: string): string {
  // Load images directly in the browser — the browser's real TLS fingerprint
  // passes Cloudflare, while server-side proxies get blocked with 403.
  return url;
}

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
  // Try multiple CORS proxies directly from client, then our server proxy
  const endpoints: ProxyEndpoint[] = [];
  if (CF_PROXY_URL) {
    endpoints.push({ url: CF_PROXY_URL + "?url=" + encodeURIComponent(url) });
  }
  // Primary: got-scraping based server endpoint (TLS fingerprint bypass)
  endpoints.push({ url: "/api/scrape?url=" + encodeURIComponent(url) });
  // Client-side CORS proxies as fallback
  endpoints.push({ url: "https://proxy.corsfix.com/?" + url });
  endpoints.push({ url: "https://every-origin.vercel.app/get?url=" + encodeURIComponent(url), json: true });
  // Legacy server-side proxy (allorigins chain)
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

      const num = extractChapterNum(currentUrl);
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

// --- Chapter Image Scraping ---

export async function scrapeChapterImages(chapterUrl: string): Promise<string[]> {
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
