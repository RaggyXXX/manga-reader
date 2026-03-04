import { NextRequest, NextResponse } from "next/server";
import { fetchWithH2 } from "@/lib/server/fetch-h2";

// Node.js runtime (not edge) — needs got + http2-wrapper for Manhwazone

export interface SearchResult {
  title: string;
  coverUrl: string;
  sourceUrl: string;
  source: "mangadex" | "mangakatana" | "vymanga" | "manhwazone";
  sourceId?: string;
  availableLanguages?: string[];
}

interface SearchError {
  source: string;
  message: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout")), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// ── MangaDex ──

async function searchMangaDex(q: string): Promise<SearchResult[]> {
  const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(q)}&includes[]=cover_art&limit=10&order[relevance]=desc`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`MangaDex API ${resp.status}`);
  const data = await resp.json();

  return (data.data || []).map((manga: Record<string, unknown>) => {
    const id = manga.id as string;
    const attrs = manga.attributes as Record<string, unknown>;
    const titleObj = attrs.title as Record<string, string>;
    const title = titleObj?.en || titleObj?.ja || titleObj?.["ja-ro"] || Object.values(titleObj || {})[0] || "Unknown";

    let coverFileName = "";
    const rels = manga.relationships as Array<Record<string, unknown>>;
    for (const rel of rels || []) {
      if (rel.type === "cover_art") {
        const relAttrs = rel.attributes as Record<string, string> | undefined;
        coverFileName = relAttrs?.fileName || "";
        break;
      }
    }
    const coverUrl = coverFileName
      ? `https://uploads.mangadex.org/covers/${id}/${coverFileName}.256.jpg`
      : "";

    return {
      title,
      coverUrl,
      sourceUrl: `https://mangadex.org/title/${id}`,
      source: "mangadex" as const,
      sourceId: id,
      availableLanguages: (attrs.availableTranslatedLanguages as string[]) || [],
    };
  });
}

// ── MangaKatana ──

async function searchMangaKatana(q: string): Promise<SearchResult[]> {
  const url = `https://mangakatana.com/?search=${encodeURIComponent(q)}&search_by=book_name`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`MangaKatana ${resp.status}`);
  // MangaKatana redirects to a random manga page when 0 results — detect and bail
  if (resp.url.includes("/manga/")) return [];
  const html = await resp.text();

  const results: SearchResult[] = [];
  // Only parse search results section, not sidebar (Hot Manga)
  const hotIdx = html.indexOf("Hot Manga");
  const searchHtml = hotIdx > -1 ? html.slice(0, hotIdx) : html;
  const items = searchHtml.split(/class\s*=\s*["']item\b/);
  for (let i = 1; i < items.length && results.length < 10; i++) {
    const block = items[i];
    // Extract cover image
    const imgMatch = block.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/);
    const coverUrl = imgMatch?.[1] || "";
    // Extract title + link from <h3 class="title"><a href="...">Title</a>
    const titleMatch = block.match(/<h3[^>]*class\s*=\s*["']title["'][^>]*>\s*<a\s+href\s*=\s*["']([^"']+)["'][^>]*>([^<]+)<\/a>/);
    if (titleMatch) {
      results.push({
        title: decodeHtmlEntities(titleMatch[2].trim()),
        coverUrl,
        sourceUrl: titleMatch[1].startsWith("http") ? titleMatch[1] : `https://mangakatana.com${titleMatch[1]}`,
        source: "mangakatana",
        availableLanguages: ["en"],
      });
    }
  }
  return results;
}

// ── VyManga ──

async function searchVyManga(q: string): Promise<SearchResult[]> {
  const url = `https://vymanga.com/search?q=${encodeURIComponent(q)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`VyManga ${resp.status}`);
  const html = await resp.text();

  const results: SearchResult[] = [];
  // VyManga search results use class="comic-item" containers
  const items = html.split(/class\s*=\s*["']comic-item\b/);
  for (let i = 1; i < items.length && results.length < 10; i++) {
    const block = items[i];
    // Extract link: <a href="/manga/slug">
    const linkMatch = block.match(/<a\s+href\s*=\s*["'](\/manga\/[^"']+)["'][^>]*>/);
    // Extract cover image: <img ... data-src="https://cdnxyz.xyz/..." or src="..."
    // Skip placeholder /web/img/blank.gif
    const imgMatch = block.match(/<img[^>]+(?:data-src|src)\s*=\s*["'](https?:\/\/[^"']+)["']/);
    // Extract title from <div class="comic-title">Title</div>
    const titleMatch = block.match(/class\s*=\s*["']comic-title["'][^>]*>([^<]+)</);
    // Fallback: title/alt attribute on <img>
    const titleFallback = block.match(/(?:title|alt)\s*=\s*["']([^"']+)["']/);

    if (linkMatch) {
      const title = titleMatch?.[1]?.trim() || titleFallback?.[1]?.trim() || "Unknown";
      results.push({
        title: decodeHtmlEntities(title),
        coverUrl: imgMatch?.[1] || "",
        sourceUrl: `https://vymanga.com${linkMatch[1]}`,
        source: "vymanga",
        availableLanguages: ["en"],
      });
    }
  }
  return results;
}

// ── Manhwazone ──

async function searchManhwazone(q: string): Promise<SearchResult[]> {
  const url = `https://manhwazone.to/search?keyword=${encodeURIComponent(q)}`;
  const { body: html } = await fetchWithH2(url, false);

  // Validate not a CF challenge
  const head = html.slice(0, 500);
  if (head.includes("<title>Just a moment") || head.includes("cf-challenge")) {
    throw new Error("Cloudflare challenge");
  }

  const results: SearchResult[] = [];
  // Manhwazone uses <article> elements for each result card
  const items = html.split(/<article\b/);
  for (let i = 1; i < items.length && results.length < 10; i++) {
    const block = items[i];
    // Extract link: <a href="/series/slug"> (relative URLs)
    const linkMatch = block.match(/<a\s+href\s*=\s*["'](\/series\/[^"']+)["']/);
    // Extract cover image: <img src="https://media.manhwazone.to/i/cover/...">
    const imgMatch = block.match(/<img\s+src\s*=\s*["'](https?:\/\/[^"']+)["']/);
    // Extract title: second <a> with the series link contains the title text
    // Pattern: <a href="/series/slug" class="...font-semibold...">Title</a>
    const titleMatch = block.match(/<a\s+href\s*=\s*["']\/series\/[^"']+["'][^>]*class\s*=\s*["'][^"']*font-semibold[^"']*["'][^>]*>\s*([^<]+)</);
    // Fallback: alt attribute on <img> (contains "Title cover")
    const altMatch = block.match(/alt\s*=\s*["']([^"']+?)(?:\s+cover)?["']/);

    if (linkMatch) {
      const title = titleMatch?.[1]?.trim() || altMatch?.[1]?.trim() || "Unknown";
      results.push({
        title: decodeHtmlEntities(title),
        coverUrl: imgMatch?.[1] || "",
        sourceUrl: `https://manhwazone.to${linkMatch[1]}`,
        source: "manhwazone",
        availableLanguages: ["en"],
      });
    }
  }
  return results;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
}

// ── Relevance scoring ──

function relevanceScore(title: string, query: string): number {
  const t = title.toLowerCase();
  const q = query.toLowerCase();

  // Exact match
  if (t === q) return 100;
  // Title starts with query
  if (t.startsWith(q)) return 90;
  // Exact query appears as whole segment (word boundary)
  const wordBoundary = new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  if (wordBoundary.test(t)) return 80;
  // Query is contained in title
  if (t.includes(q)) return 70;
  // All query words appear in title
  const qWords = q.split(/\s+/);
  const allWordsMatch = qWords.every((w) => t.includes(w));
  if (allWordsMatch) return 60;
  // Some query words match
  const matchCount = qWords.filter((w) => t.includes(w)).length;
  return (matchCount / qWords.length) * 50;
}

// ── Main handler ──

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json(
      { error: "Query must be at least 2 characters" },
      { status: 400 },
    );
  }

  const sources = [
    { name: "mangadex", fn: () => searchMangaDex(q) },
    { name: "mangakatana", fn: () => searchMangaKatana(q) },
    { name: "vymanga", fn: () => searchVyManga(q) },
    { name: "manhwazone", fn: () => searchManhwazone(q) },
  ];

  const settled = await Promise.allSettled(
    sources.map((s) => withTimeout(s.fn(), 8000)),
  );

  const results: SearchResult[] = [];
  const errors: SearchError[] = [];

  settled.forEach((result, i) => {
    if (result.status === "fulfilled") {
      results.push(...result.value);
    } else {
      errors.push({
        source: sources[i].name,
        message: result.reason?.message || "Unknown error",
      });
    }
  });

  // Sort by relevance: best title match first
  results.sort((a, b) => relevanceScore(b.title, q) - relevanceScore(a.title, q));

  return NextResponse.json(
    { results, errors },
    {
      headers: {
        "Cache-Control": "no-store",
        "CDN-Cache-Control": "no-store",
      },
    },
  );
}
