import { NextRequest, NextResponse } from "next/server";
import { fetchWithH2 } from "@/lib/server/fetch-h2";

// Node.js runtime (not edge) — needs got + http2-wrapper for Manhwazone

export interface SearchResult {
  title: string;
  coverUrl: string;
  sourceUrl: string;
  source: "mangadex" | "mangakatana" | "manhwazone" | "weebcentral" | "atsumaru" | "mangabuddy";
  sourceId?: string;
  availableLanguages?: string[];
  chapterCount?: number;
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

    const lastCh = attrs.lastChapter as string | undefined;
    return {
      title,
      coverUrl,
      sourceUrl: `https://mangadex.org/title/${id}`,
      source: "mangadex" as const,
      sourceId: id,
      availableLanguages: (attrs.availableTranslatedLanguages as string[]) || [],
      chapterCount: lastCh ? parseInt(lastCh, 10) || undefined : undefined,
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
      // Extract chapter count from "Update chapter N" text
      const chMatch = block.match(/Update chapter\s+(\d+)/i);
      results.push({
        title: decodeHtmlEntities(titleMatch[2].trim()),
        coverUrl,
        sourceUrl: titleMatch[1].startsWith("http") ? titleMatch[1] : `https://mangakatana.com${titleMatch[1]}`,
        source: "mangakatana",
        availableLanguages: ["en"],
        chapterCount: chMatch ? parseInt(chMatch[1], 10) : undefined,
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
      // Extract chapter count from "Chapter N" text in search card
      const chNums = block.match(/Chapter\s+(\d+)/gi);
      let chapterCount: number | undefined;
      if (chNums) {
        const nums = chNums.map((m) => parseInt(m.replace(/Chapter\s+/i, ""), 10));
        chapterCount = Math.max(...nums);
      }
      results.push({
        title: decodeHtmlEntities(title),
        coverUrl: imgMatch?.[1] || "",
        sourceUrl: `https://manhwazone.to${linkMatch[1]}`,
        source: "manhwazone",
        availableLanguages: ["en"],
        chapterCount,
      });
    }
  }
  return results;
}

// ── WeebCentral ──

async function searchWeebCentral(q: string): Promise<SearchResult[]> {
  const resp = await fetch("https://weebcentral.com/search/simple?location=main", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "HX-Request": "true",
    },
    body: `text=${encodeURIComponent(q)}`,
  });
  if (!resp.ok) throw new Error(`WeebCentral ${resp.status}`);
  const html = await resp.text();

  const results: SearchResult[] = [];
  // Each result is an <a href="https://weebcentral.com/series/{ULID}/Slug">
  const items = html.split(/<a\s+href="https:\/\/weebcentral\.com\/series\//);
  for (let i = 1; i < items.length && results.length < 10; i++) {
    const block = items[i];
    // Extract ULID and slug
    const idMatch = block.match(/^([A-Z0-9]+)\/([^"]*)"/)
    if (!idMatch) continue;
    const ulid = idMatch[1];
    const slug = idMatch[2];

    // Title from <span class="line-clamp-1 ...">Title</span>
    const titleMatch = block.match(/line-clamp-1[^>]*>([^<]+)</);
    const title = titleMatch?.[1]?.trim() || slug.replace(/-/g, " ");

    // Cover: temp.compsci88.com/cover/small/{ULID}.webp
    const coverUrl = `https://temp.compsci88.com/cover/small/${ulid}.webp`;

    results.push({
      title: decodeHtmlEntities(title),
      coverUrl,
      sourceUrl: `https://weebcentral.com/series/${ulid}/${slug}`,
      source: "weebcentral",
      sourceId: ulid,
      availableLanguages: ["en"],
    });
  }
  return results;
}

// ── Atsumaru ──

async function searchAtsumaru(q: string): Promise<SearchResult[]> {
  const url = `https://atsu.moe/collections/manga/documents/search?q=${encodeURIComponent(q)}&query_by=title,englishTitle,otherNames,authors&include_fields=id,title,englishTitle,poster,status,type&limit=10&num_typos=4&query_by_weights=4,3,2,1`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Atsumaru ${resp.status}`);
  const data = await resp.json();

  return (data.hits || []).map((hit: Record<string, unknown>) => {
    const doc = hit.document as Record<string, unknown>;
    const poster = doc.poster as Record<string, string> | undefined;
    const coverUrl = poster?.mediumImage
      ? `https://atsu.moe/${poster.mediumImage}`
      : poster?.smallImage
        ? `https://atsu.moe/${poster.smallImage}`
        : "";

    return {
      title: (doc.englishTitle as string) || (doc.title as string) || "Unknown",
      coverUrl,
      sourceUrl: `https://atsu.moe/manga/${doc.id}`,
      source: "atsumaru" as const,
      sourceId: doc.id as string,
      availableLanguages: ["en"],
    };
  });
}

// ── MangaBuddy ──

async function searchMangaBuddy(q: string): Promise<SearchResult[]> {
  const resp = await fetch(`https://mangabuddy.com/api/manga/search?q=${encodeURIComponent(q)}`);
  if (!resp.ok) throw new Error(`MangaBuddy ${resp.status}`);
  const html = await resp.text();

  const results: SearchResult[] = [];
  const items = html.split(/class="novel__item"/);
  for (let i = 1; i < items.length && results.length < 10; i++) {
    const block = items[i];
    // Extract href and title
    const linkMatch = block.match(/<a\s+title="([^"]*)"[^>]*href="\/([^"]+)"/);
    if (!linkMatch) continue;
    const title = linkMatch[1].trim();
    const slug = linkMatch[2];

    // Cover
    const imgMatch = block.match(/<img\s+src="(https:\/\/res\.mbbcdn\.com[^"]+)"/);
    const coverUrl = imgMatch?.[1] || "";

    // Chapter count from "Chapter N" in the card
    const chMatch = block.match(/title="Chapter\s+(\d+(?:\.\d+)?)/i);
    const chapterCount = chMatch ? parseInt(chMatch[1], 10) : undefined;

    results.push({
      title: decodeHtmlEntities(title),
      coverUrl,
      sourceUrl: `https://mangabuddy.com/${slug}`,
      source: "mangabuddy",
      availableLanguages: ["en"],
      chapterCount,
    });
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
    { name: "manhwazone", fn: () => searchManhwazone(q) },
    { name: "weebcentral", fn: () => searchWeebCentral(q) },
    { name: "atsumaru", fn: () => searchAtsumaru(q) },
    { name: "mangabuddy", fn: () => searchMangaBuddy(q) },
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
