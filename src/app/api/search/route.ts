import { NextRequest, NextResponse } from "next/server";
import { fetchWithH2 } from "@/lib/server/fetch-h2";

// Node.js runtime (not edge) — needs got + http2-wrapper for Manhwazone

export interface SearchResult {
  title: string;
  coverUrl: string;
  sourceUrl: string;
  source: "mangadex" | "mangakatana" | "vymanga" | "manhwazone";
  sourceId?: string;
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
    };
  });
}

// ── MangaKatana ──

async function searchMangaKatana(q: string): Promise<SearchResult[]> {
  const url = `https://mangakatana.com/?search=${encodeURIComponent(q)}&search_by=book_name`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`MangaKatana ${resp.status}`);
  const html = await resp.text();

  const results: SearchResult[] = [];
  // Split by item blocks
  const items = html.split(/class\s*=\s*["']item\b/);
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
  // VyManga search results are in manga item blocks
  const items = html.split(/class\s*=\s*["']manga-item\b|class\s*=\s*["']item\b/);
  for (let i = 1; i < items.length && results.length < 10; i++) {
    const block = items[i];
    // Extract link + title
    const linkMatch = block.match(/<a\s+href\s*=\s*["'](\/manga\/[^"']+)["'][^>]*>/);
    const titleMatch = block.match(/(?:title|alt)\s*=\s*["']([^"']+)["']/);
    const imgMatch = block.match(/<img[^>]+(?:data-src|src)\s*=\s*["']([^"']+)["']/);

    if (linkMatch) {
      results.push({
        title: decodeHtmlEntities(titleMatch?.[1]?.trim() || "Unknown"),
        coverUrl: imgMatch?.[1] || "",
        sourceUrl: `https://vymanga.com${linkMatch[1]}`,
        source: "vymanga",
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
  // Split by series cards/items
  const items = html.split(/class\s*=\s*["']item\b|class\s*=\s*["']book-item\b|class\s*=\s*["']manga-item\b/);
  for (let i = 1; i < items.length && results.length < 10; i++) {
    const block = items[i];
    const linkMatch = block.match(/<a\s+href\s*=\s*["'](https?:\/\/manhwazone\.to\/series\/[^"']+)["']/);
    const titleMatch = block.match(/(?:title|alt)\s*=\s*["']([^"']+)["']/);
    const imgMatch = block.match(/<img[^>]+(?:data-src|src)\s*=\s*["']([^"']+)["']/);

    if (linkMatch) {
      results.push({
        title: decodeHtmlEntities(titleMatch?.[1]?.trim() || "Unknown"),
        coverUrl: imgMatch?.[1] || "",
        sourceUrl: linkMatch[1],
        source: "manhwazone",
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

  return NextResponse.json(
    { query: q, results, errors },
    {
      headers: {
        "Cache-Control": "no-store",
        "CDN-Cache-Control": "no-store",
      },
    },
  );
}
