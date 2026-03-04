import { NextRequest, NextResponse } from "next/server";
import { fetchWithH2 } from "@/lib/server/fetch-h2";

export interface PreviewMeta {
  title: string;
  description: string;
  status: string;
  author: string;
  genres: string[];
  chapterCount: number;
  year: number | null;
  coverUrl: string;
}

const MANGADEX_API = "https://api.mangadex.org";

// ── MangaDex preview ──

async function previewMangaDex(sourceId: string): Promise<PreviewMeta> {
  // Fetch manga details with author + artist
  const resp = await fetch(
    `${MANGADEX_API}/manga/${sourceId}?includes[]=cover_art&includes[]=author&includes[]=artist`,
    { headers: { "User-Agent": "MangaReaderPWA/1.0" } },
  );
  if (!resp.ok) throw new Error(`MangaDex ${resp.status}`);
  const { data: manga } = await resp.json();
  const attrs = manga.attributes;

  // Title
  const titleObj = attrs.title || {};
  const title = titleObj.en || titleObj.ja || titleObj["ja-ro"] || Object.values(titleObj)[0] || "Unknown";

  // Description
  const descObj = attrs.description || {};
  const description = (descObj.en || descObj.de || Object.values(descObj)[0] || "") as string;

  // Status
  const statusMap: Record<string, string> = {
    ongoing: "Ongoing",
    completed: "Completed",
    hiatus: "Hiatus",
    cancelled: "Cancelled",
  };
  const status = statusMap[attrs.status] || attrs.status || "Unknown";

  // Author / Artist
  const rels = manga.relationships || [];
  const authorRel = rels.find((r: { type: string }) => r.type === "author");
  const artistRel = rels.find((r: { type: string }) => r.type === "artist");
  const authorName = authorRel?.attributes?.name || "";
  const artistName = artistRel?.attributes?.name || "";
  const author = authorName && artistName && authorName !== artistName
    ? `${authorName} / ${artistName}`
    : authorName || artistName || "Unknown";

  // Genres / Tags
  const genres = (attrs.tags || [])
    .filter((t: { attributes: { group: string } }) => t.attributes.group === "genre")
    .map((t: { attributes: { name: { en?: string } } }) => t.attributes.name.en || "")
    .filter(Boolean)
    .slice(0, 8);

  // Cover
  let coverUrl = "";
  const coverRel = rels.find((r: { type: string }) => r.type === "cover_art");
  if (coverRel?.attributes?.fileName) {
    coverUrl = `https://uploads.mangadex.org/covers/${sourceId}/${coverRel.attributes.fileName}.512.jpg`;
  }

  // Year
  const year = attrs.year || null;

  // Chapter count
  let chapterCount = 0;
  try {
    const chResp = await fetch(
      `${MANGADEX_API}/manga/${sourceId}/feed?translatedLanguage[]=en&limit=1&offset=0`,
      { headers: { "User-Agent": "MangaReaderPWA/1.0" } },
    );
    if (chResp.ok) {
      const chData = await chResp.json();
      chapterCount = chData.total || 0;
    }
  } catch { /* ignore */ }

  return { title: title as string, description, status, author, genres, chapterCount, year, coverUrl };
}

// ── HTML source preview ──

async function previewHtmlSource(
  sourceUrl: string,
  source: string,
): Promise<PreviewMeta> {
  let html: string;

  if (source === "manhwazone") {
    const result = await fetchWithH2(sourceUrl, false);
    html = result.body;
  } else {
    const resp = await fetch(sourceUrl);
    if (!resp.ok) throw new Error(`${source} ${resp.status}`);
    html = await resp.text();
  }

  let title = "Unknown";
  let description = "";
  let status = "Unknown";
  let author = "Unknown";
  let genres: string[] = [];
  let chapterCount = 0;
  let year: number | null = null;
  let coverUrl = "";

  // ── Title ──
  const ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/);
  const h1 = html.match(/<h1[^>]*>([^<]+)</);
  title = ogTitle?.[1]?.trim() || h1?.[1]?.trim() || "Unknown";

  // ── Cover ──
  const ogImage = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/);
  coverUrl = ogImage?.[1] || "";

  // ── Description ──
  const ogDesc = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/);
  const metaDesc = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/);
  description = ogDesc?.[1]?.trim() || metaDesc?.[1]?.trim() || "";

  if (source === "mangakatana") {
    // Status: class="status completed">Completed
    const statusMatch = html.match(/class="status[^"]*">([^<]+)/);
    status = statusMatch?.[1]?.trim() || "Unknown";

    // Author: author/slug.id">Name
    const authorMatch = html.match(/author\/[^"]*">([^<]+)/);
    author = authorMatch?.[1]?.trim() || "Unknown";

    // Genres: genre/slug" class="text_0">Name
    const genreMatches = html.match(/genre\/[a-z0-9-]+"[^>]*>([^<]+)/g);
    if (genreMatches) {
      genres = genreMatches.map((m) => m.replace(/.*>/, "").trim()).slice(0, 8);
    }

    // Chapter count: /c{num} links
    const chLinks = html.match(/href="[^"]*\/c(\d+(?:\.\d+)?)/g);
    chapterCount = chLinks ? new Set(chLinks).size : 0;

    // Description from summary div
    const summaryMatch = html.match(/class="summary"[^>]*>([\s\S]*?)<\/div>/);
    if (summaryMatch) {
      description = summaryMatch[1].replace(/<[^>]+>/g, "").trim().slice(0, 500);
    }
  } else if (source === "vymanga") {
    // Status: text-completed">Completed or text-ongoing">Ongoing
    const statusMatch = html.match(/text-(completed|ongoing)"[^>]*>([^<]+)/i);
    status = statusMatch?.[2]?.trim() || "Unknown";

    // Genres: badge badge-info label-badge">Genre
    const genreMatches = html.match(/badge badge-info label-badge">([^<]+)/g);
    if (genreMatches) {
      genres = genreMatches.map((m) => m.replace(/.*">/, "").trim()).slice(0, 8);
    }

    // Chapter count: "Chapter N" text
    const chMatches = html.match(/Chapter\s+(\d+(?:\.\d+)?)/g);
    if (chMatches) {
      const unique = new Set(chMatches.map((m) => m.replace(/Chapter\s+/, "")));
      chapterCount = unique.size;
    }

    // Description
    const descMatch = html.match(/class="description"[^>]*>([\s\S]*?)<\/div>/);
    if (descMatch) {
      description = descMatch[1].replace(/<[^>]+>/g, "").trim().slice(0, 500);
    }
  } else if (source === "manhwazone") {
    // Status
    const statusMatch = html.match(/Status[\s\S]*?(Ongoing|Completed|Hiatus|Cancelled)/i);
    status = statusMatch?.[1] || "Unknown";

    // Author
    const authorMatch = html.match(/Author[\s\S]*?<[^>]*>([^<]+)/i);
    if (authorMatch && authorMatch[1].trim().length > 1) {
      author = authorMatch[1].trim();
    }

    // Genres: genre links
    const genreMatches = html.match(/genre\/[^"]*"[^>]*>([^<]+)/gi);
    if (genreMatches) {
      genres = genreMatches.map((m) => m.replace(/.*>/, "").trim()).filter(Boolean).slice(0, 8);
    }

    // Chapter count: /chapter-N links
    const chLinks = html.match(/href="[^"]*\/chapter-(\d+)/g);
    chapterCount = chLinks ? new Set(chLinks).size : 0;

    // Description
    const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/);
    if (descMatch) {
      description = descMatch[1].trim().slice(0, 500);
    }
  }

  // Decode HTML entities in description
  description = description
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));

  return { title, description, status, author, genres, chapterCount, year, coverUrl };
}

// ── Main handler ──

export async function GET(req: NextRequest) {
  const sourceUrl = req.nextUrl.searchParams.get("url");
  const source = req.nextUrl.searchParams.get("source");
  const sourceId = req.nextUrl.searchParams.get("sourceId");

  if (!sourceUrl || !source) {
    return NextResponse.json({ error: "Missing url or source" }, { status: 400 });
  }

  try {
    let meta: PreviewMeta;

    if (source === "mangadex" && sourceId) {
      meta = await previewMangaDex(sourceId);
    } else {
      meta = await previewHtmlSource(sourceUrl, source);
    }

    return NextResponse.json(meta, {
      headers: {
        "Cache-Control": "no-store",
        "CDN-Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
