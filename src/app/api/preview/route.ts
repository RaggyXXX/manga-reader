import { NextRequest, NextResponse } from "next/server";
import { fetchWithH2 } from "@/lib/server/fetch-h2";

export interface PreviewMeta {
  title: string;
  altTitles: string[];
  description: string;
  status: string;
  author: string;
  artist: string;
  genres: string[];
  themes: string[];
  formats: string[];
  chapterCount: number;
  year: number | null;
  coverUrl: string;
  availableLanguages: string[];
  originalLanguage: string;
  contentRating: string;
  demographic: string;
  lastChapter: string;
  lastVolume: string;
  rating: string;
  follows: string;
  views: string;
  updatedAt: string;
  publishedRange: string;
  type: string;
}

function emptyMeta(): PreviewMeta {
  return {
    title: "Unknown",
    altTitles: [],
    description: "",
    status: "Unknown",
    author: "",
    artist: "",
    genres: [],
    themes: [],
    formats: [],
    chapterCount: 0,
    year: null,
    coverUrl: "",
    availableLanguages: [],
    originalLanguage: "",
    contentRating: "",
    demographic: "",
    lastChapter: "",
    lastVolume: "",
    rating: "",
    follows: "",
    views: "",
    updatedAt: "",
    publishedRange: "",
    type: "",
  };
}

const MANGADEX_API = "https://api.mangadex.org";

// ── MangaDex preview ──

async function previewMangaDex(sourceId: string, lang = "en"): Promise<PreviewMeta> {
  const meta = emptyMeta();

  const resp = await fetch(
    `${MANGADEX_API}/manga/${sourceId}?includes[]=cover_art&includes[]=author&includes[]=artist`,
    { headers: { "User-Agent": "MangaBlastPWA/1.0" } },
  );
  if (!resp.ok) throw new Error(`MangaDex ${resp.status}`);
  const { data: manga } = await resp.json();
  const attrs = manga.attributes;
  const rels = manga.relationships || [];

  // Title
  const titleObj = attrs.title || {};
  meta.title = (titleObj.en || titleObj.ja || titleObj["ja-ro"] || Object.values(titleObj)[0] || "Unknown") as string;

  // Alt titles
  const altArr = attrs.altTitles || [];
  const seen = new Set<string>();
  for (const obj of altArr) {
    for (const val of Object.values(obj as Record<string, string>)) {
      const v = (val as string).trim();
      if (v && v !== meta.title && !seen.has(v)) {
        seen.add(v);
        meta.altTitles.push(v);
      }
    }
  }
  meta.altTitles = meta.altTitles.slice(0, 10);

  // Description
  const descObj = attrs.description || {};
  meta.description = (descObj.en || descObj.de || Object.values(descObj)[0] || "") as string;

  // Status
  const statusMap: Record<string, string> = {
    ongoing: "Ongoing",
    completed: "Completed",
    hiatus: "Hiatus",
    cancelled: "Cancelled",
  };
  meta.status = statusMap[attrs.status] || attrs.status || "Unknown";

  // Author / Artist (separate)
  const authors = rels.filter((r: { type: string }) => r.type === "author");
  const artists = rels.filter((r: { type: string }) => r.type === "artist");
  meta.author = authors.map((r: { attributes?: { name?: string } }) => r.attributes?.name || "").filter(Boolean).join(", ") || "";
  meta.artist = artists.map((r: { attributes?: { name?: string } }) => r.attributes?.name || "").filter(Boolean).join(", ") || "";

  // Tags by group
  const tags = attrs.tags || [];
  for (const t of tags) {
    const group = t.attributes?.group;
    const name = t.attributes?.name?.en;
    if (!name) continue;
    if (group === "genre") meta.genres.push(name);
    else if (group === "theme") meta.themes.push(name);
    else if (group === "format") meta.formats.push(name);
  }

  // Cover
  const coverRel = rels.find((r: { type: string }) => r.type === "cover_art");
  if (coverRel?.attributes?.fileName) {
    meta.coverUrl = `https://uploads.mangadex.org/covers/${sourceId}/${coverRel.attributes.fileName}.512.jpg`;
  }

  // Year, demographic, content rating, original language
  meta.year = attrs.year || null;
  meta.demographic = attrs.publicationDemographic || "";
  meta.contentRating = attrs.contentRating || "";
  meta.originalLanguage = attrs.originalLanguage || "";
  meta.lastChapter = attrs.lastChapter || "";
  meta.lastVolume = attrs.lastVolume || "";
  meta.type = meta.originalLanguage === "ko" ? "Manhwa" : meta.originalLanguage === "ja" ? "Manga" : meta.originalLanguage === "zh" ? "Manhua" : "";

  // Available languages
  meta.availableLanguages = attrs.availableTranslatedLanguages || [];

  // Updated at
  if (attrs.updatedAt) {
    meta.updatedAt = attrs.updatedAt;
  }

  // Chapter count (English)
  try {
    const chResp = await fetch(
      `${MANGADEX_API}/manga/${sourceId}/feed?translatedLanguage[]=${encodeURIComponent(lang)}&limit=1&offset=0`,
      { headers: { "User-Agent": "MangaBlastPWA/1.0" } },
    );
    if (chResp.ok) {
      const chData = await chResp.json();
      meta.chapterCount = chData.total || 0;
    }
  } catch { /* ignore */ }

  // Statistics (rating, follows)
  try {
    const statsResp = await fetch(
      `${MANGADEX_API}/statistics/manga/${sourceId}`,
      { headers: { "User-Agent": "MangaBlastPWA/1.0" } },
    );
    if (statsResp.ok) {
      const statsData = await statsResp.json();
      const stats = statsData.statistics?.[sourceId];
      if (stats) {
        if (stats.rating?.bayesian) {
          meta.rating = stats.rating.bayesian.toFixed(2);
        }
        if (stats.follows != null) {
          meta.follows = formatNumber(stats.follows);
        }
      }
    }
  } catch { /* ignore */ }

  return meta;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── HTML source preview ──

async function previewHtmlSource(
  sourceUrl: string,
  source: string,
): Promise<PreviewMeta> {
  const meta = emptyMeta();
  meta.availableLanguages = ["en"];

  let html: string;
  if (source === "manhwazone") {
    const result = await fetchWithH2(sourceUrl, false);
    html = result.body;
  } else {
    const resp = await fetch(sourceUrl);
    if (!resp.ok) throw new Error(`${source} ${resp.status}`);
    html = await resp.text();
  }

  // ── Common: Title ──
  const ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/);
  const h1 = html.match(/<h1[^>]*>([^<]+)</);
  meta.title = ogTitle?.[1]?.trim() || h1?.[1]?.trim() || "Unknown";

  // ── Common: Cover ──
  const ogImage = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/);
  meta.coverUrl = ogImage?.[1] || "";

  // ── Common: Description fallback ──
  const ogDesc = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/);
  const metaDesc = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/);
  meta.description = ogDesc?.[1]?.trim() || metaDesc?.[1]?.trim() || "";

  if (source === "mangakatana") {
    parseMangaKatana(html, meta);
  } else if (source === "vymanga") {
    parseVyManga(html, meta);
  } else if (source === "manhwazone") {
    parseManhwazone(html, meta);
  }

  // Decode HTML entities in description
  meta.description = decodeEntities(meta.description);

  return meta;
}

function parseMangaKatana(html: string, meta: PreviewMeta) {
  // Alt names
  const altMatch = html.match(/Alt name\(s\):[^>]*<[^>]*>([^<]+)/i);
  if (altMatch) {
    meta.altTitles = altMatch[1].split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  }

  // Status
  const statusMatch = html.match(/class="status[^"]*">([^<]+)/);
  meta.status = statusMatch?.[1]?.trim() || "Unknown";

  // Author(s) / Artist(s) — combined
  const authorMatches = html.match(/author\/[^"]*">([^<]+)/g);
  if (authorMatches) {
    const names = authorMatches.map((m) => m.replace(/.*>/, "").trim());
    meta.author = names.join(", ");
  }

  // Genres
  const genreMatches = html.match(/genre\/[a-z0-9-]+"[^>]*>([^<]+)/g);
  if (genreMatches) {
    meta.genres = genreMatches.map((m) => m.replace(/.*>/, "").trim()).slice(0, 12);
  }

  // Chapter count
  const chLinks = html.match(/href="[^"]*\/c(\d+(?:\.\d+)?)/g);
  meta.chapterCount = chLinks ? new Set(chLinks).size : 0;

  // Last chapter
  const latestMatch = html.match(/Latest chapter\(s\):[^>]*<[^>]*>[^>]*>([^<]+)/i);
  if (latestMatch) meta.lastChapter = latestMatch[1].trim().replace(/^Chapter\s*/i, "");

  // Updated at
  const updateMatch = html.match(/Update at:[^>]*<[^>]*>([^<]+)/i);
  if (updateMatch) meta.updatedAt = updateMatch[1].trim();

  // Description from summary div
  const summaryMatch = html.match(/class="summary"[^>]*>([\s\S]*?)<\/div>/);
  if (summaryMatch) {
    meta.description = summaryMatch[1].replace(/<[^>]+>/g, "").trim();
  }

  meta.type = "Manga";
}

function parseVyManga(html: string, meta: PreviewMeta) {
  // Alt title (from paragraph after h1)
  const altMatch = html.match(/<h1[^>]*>[^<]+<\/h1>\s*<p[^>]*>([^<]+)/i);
  if (altMatch && altMatch[1].trim()) {
    meta.altTitles = [altMatch[1].trim()];
  }

  // Status
  const statusMatch = html.match(/Status\s*<[^>]*>:\s*<\/[^>]*>([^<]+)/i);
  if (statusMatch) meta.status = statusMatch[1].trim();
  if (meta.status === "Unknown") {
    const statusFallback = html.match(/text-(completed|ongoing)"[^>]*>([^<]+)/i);
    if (statusFallback) meta.status = statusFallback[2].trim();
  }

  // Authors
  const authorMatch = html.match(/Authors\s*<[^>]*>:\s*<\/[^>]*>([^<]+)/i);
  if (authorMatch && authorMatch[1].trim() !== "--") {
    meta.author = authorMatch[1].trim();
  }

  // Genres
  const genreMatches = html.match(/badge badge-info label-badge">([^<]+)/g);
  if (genreMatches) {
    meta.genres = genreMatches.map((m) => m.replace(/.*">/, "").trim()).slice(0, 12);
  }

  // Rating
  const ratingMatch = html.match(/(\d+\.\d+)\/10\s*\(([^)]+)\)/);
  if (ratingMatch) {
    meta.rating = `${ratingMatch[1]}/10`;
    meta.views = ratingMatch[2].trim() + " votes";
  }

  // Views
  const viewMatch = html.match(/View\s*<[^>]*>:\s*<\/[^>]*>([\d,]+)/i);
  if (viewMatch) meta.views = viewMatch[1].trim();

  // Followers
  const followMatch = html.match(/Followed by ([\d,]+) people/i);
  if (followMatch) meta.follows = followMatch[1].trim();

  // Chapter count
  const chMatches = html.match(/Chapter\s+(\d+(?:\.\d+)?)/g);
  if (chMatches) {
    const unique = new Set(chMatches.map((m) => m.replace(/Chapter\s+/, "")));
    meta.chapterCount = unique.size;
  }

  // Description
  const descMatch = html.match(/class="description"[^>]*>([\s\S]*?)<\/div>/);
  if (!descMatch) {
    const summaryMatch = html.match(/Summary<\/p>\s*<p[^>]*>([\s\S]*?)<\/p>/i);
    if (summaryMatch) {
      meta.description = summaryMatch[1].replace(/<[^>]+>/g, "").trim();
    }
  } else {
    meta.description = descMatch[1].replace(/<[^>]+>/g, "").trim();
  }

  meta.type = "Manga";
}

function parseManhwazone(html: string, meta: PreviewMeta) {
  // Alt titles: "Also known as:" text
  const alsoMatch = html.match(/Also known as:\s*([^<]+)/i);
  if (alsoMatch) {
    meta.altTitles = alsoMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
  }

  // Type badge (Manhwa/Manga)
  const typeMatch = html.match(/>\s*(Manhwa|Manga|Manhua)\s*</i);
  if (typeMatch) meta.type = typeMatch[1];

  // Status
  const statusFinished = html.match(/>\s*(Finished|On Going|On Hiatus|Discontinued)\s*</i);
  if (statusFinished) {
    const s = statusFinished[1];
    meta.status = s === "Finished" ? "Completed" : s === "On Going" ? "Ongoing" : s;
  }

  // Authors
  const authorMatch = html.match(/Authors[\s\S]*?<\/[^>]*>\s*([^<]+)/i);
  if (authorMatch && authorMatch[1].trim().length > 1) {
    meta.author = authorMatch[1].trim();
  }

  // Published range
  const pubMatch = html.match(/Published[\s\S]*?<\/[^>]*>\s*([^<]+)/i);
  if (pubMatch) meta.publishedRange = pubMatch[1].trim();

  // Genres
  const genreMatches = html.match(/\/genres\/[^"]*"[^>]*>([^<]+)/gi);
  if (genreMatches) {
    meta.genres = genreMatches.map((m) => m.replace(/.*>/, "").trim()).filter(Boolean).slice(0, 12);
  }

  // Score / Rating
  const scoreMatch = html.match(/(\d+\.?\d*)\/5/);
  if (scoreMatch) meta.rating = `${scoreMatch[1]}/5`;

  // Followers
  const followMatch = html.match(/Followers[\s\S]*?<dd[^>]*>([\d,.]+K?)/i);
  if (followMatch) meta.follows = followMatch[1].trim();

  // Rank
  const rankMatch = html.match(/Rank[\s\S]*?<dd[^>]*>#?(\d+)/i);

  // Views (from popularity)
  const popMatch = html.match(/Popularity[\s\S]*?<dd[^>]*>([\d,.]+)/i);

  // Chapter count
  const chLinks = html.match(/\/chapter-(\d+)/g);
  if (chLinks) {
    const nums = new Set(chLinks.map((m) => m.replace(/.*chapter-/, "")));
    meta.chapterCount = nums.size;
  }

  // Last chapter (first in list)
  const lastChMatch = html.match(/Chapter\s+(\d+)/);
  if (lastChMatch) meta.lastChapter = lastChMatch[1];

  // Description: Official Synopsis section, or fallback to meta description
  const synopsisMatch = html.match(/Official Synopsis[\s\S]*?<\/h3>\s*<[^>]*>([\s\S]*?)<\/(?:div|p)>/i);
  if (synopsisMatch) {
    const cleaned = synopsisMatch[1].replace(/<[^>]+>/g, "").replace(/<p[^>]*>/g, "\n").trim();
    if (cleaned.length > 20) meta.description = cleaned;
  }
  if (!meta.description || meta.description.length < 20) {
    const descBlock = html.match(/Description[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
    if (descBlock) {
      meta.description = descBlock[1].replace(/<[^>]+>/g, "").trim();
    }
  }

  // Suppress rank/pop (unused vars)
  void rankMatch;
  void popMatch;
}

function decodeEntities(str: string): string {
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
  const sourceUrl = req.nextUrl.searchParams.get("url");
  const source = req.nextUrl.searchParams.get("source");
  const sourceId = req.nextUrl.searchParams.get("sourceId");
  const lang = req.nextUrl.searchParams.get("lang") || "en";

  if (!sourceUrl || !source) {
    return NextResponse.json({ error: "Missing url or source" }, { status: 400 });
  }

  try {
    let meta: PreviewMeta;

    if (source === "mangadex" && sourceId) {
      meta = await previewMangaDex(sourceId, lang);
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
