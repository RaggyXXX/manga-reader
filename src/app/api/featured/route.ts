import { NextResponse } from "next/server";
import type { SearchResult } from "@/lib/search-aggregation";
import { relevanceScore } from "@/lib/search-aggregation";
import {
  searchMangaKatana,
  searchManhwazone,
  searchMangaBuddy,
} from "@/lib/server/search-sources";

interface MangaDexRelationship {
  type?: string;
  attributes?: { fileName?: string };
}

interface MangaDexManga {
  id: string;
  attributes?: {
    title?: Record<string, string>;
    altTitles?: Record<string, string>[];
  };
  relationships?: MangaDexRelationship[];
}

function pickTitle(titleObj: Record<string, string> | undefined): string {
  if (!titleObj) return "Unknown";
  return titleObj.en || titleObj["ja-ro"] || titleObj.ja || Object.values(titleObj)[0] || "Unknown";
}

function pickEnglishTitle(manga: MangaDexManga): string | null {
  const main = manga.attributes?.title;
  if (main?.en) return main.en;
  for (const alt of manga.attributes?.altTitles || []) {
    if (alt.en) return alt.en;
  }
  return null;
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

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function getMangaDexChapterCount(sourceId: string): Promise<number> {
  const resp = await fetch(
    `https://api.mangadex.org/manga/${sourceId}/feed?translatedLanguage[]=en&limit=1&offset=0`,
  );
  if (!resp.ok) return 0;
  const data = await resp.json();
  return data.total || 0;
}

/** Search a title across sources that return chapter counts. */
async function findBestSource(
  manga: MangaDexManga,
  mdCoverUrl: string,
): Promise<SearchResult> {
  const mainTitle = pickTitle(manga.attributes?.title);
  const englishTitle = pickEnglishTitle(manga);
  const searchTitle = englishTitle || mainTitle;

  const mdSourceId = manga.id;
  const mdResult: SearchResult = {
    title: mainTitle,
    coverUrl: mdCoverUrl,
    sourceUrl: `https://mangadex.org/title/${mdSourceId}`,
    source: "mangadex",
    sourceId: mdSourceId,
    availableLanguages: [],
    chapterCount: 0,
  };

  // Fetch MangaDex chapter count + search other sources in parallel
  const [mdCount, katanaResults, buddyResults, manhwaResults] = await Promise.all([
    withTimeout(getMangaDexChapterCount(mdSourceId), 5000).catch(() => 0),
    withTimeout(searchMangaKatana(searchTitle), 5000).catch(() => [] as SearchResult[]),
    withTimeout(searchMangaBuddy(searchTitle), 5000).catch(() => [] as SearchResult[]),
    withTimeout(searchManhwazone(searchTitle), 5000).catch(() => [] as SearchResult[]),
  ]);

  mdResult.chapterCount = mdCount;

  let best = mdResult;

  const allResults = [...katanaResults, ...buddyResults, ...manhwaResults];

  for (const result of allResults) {
    if ((result.chapterCount || 0) <= (best.chapterCount || 0)) continue;

    // Check title relevance against both main and English title
    const score1 = relevanceScore(result.title, mainTitle);
    const score2 = englishTitle ? relevanceScore(result.title, englishTitle) : 0;
    const bestScore = Math.max(score1, score2);

    if (bestScore < 50) continue;

    best = {
      ...result,
      // Keep MangaDex cover — usually higher quality
      coverUrl: mdCoverUrl || result.coverUrl,
    };
  }

  return best;
}

export async function GET() {
  const url =
    "https://api.mangadex.org/manga?limit=20&includes[]=cover_art&availableTranslatedLanguage[]=en&contentRating[]=safe&contentRating[]=suggestive&order[followedCount]=desc";
  const response = await fetch(url, {
    next: { revalidate: 1800 },
  });

  if (!response.ok) {
    return NextResponse.json({ error: `Featured fetch failed: ${response.status}` }, { status: 502 });
  }

  const data = await response.json();
  const mangaList: MangaDexManga[] = data.data || [];

  // Extract cover URLs
  const covers = mangaList.map((manga) => {
    let coverFileName = "";
    for (const rel of manga.relationships || []) {
      if (rel.type === "cover_art" && rel.attributes?.fileName) {
        coverFileName = rel.attributes.fileName;
        break;
      }
    }
    return coverFileName
      ? `https://uploads.mangadex.org/covers/${manga.id}/${coverFileName}.256.jpg`
      : "";
  });

  // Process in batches of 5 to avoid hammering sources
  const results: SearchResult[] = [];
  const BATCH_SIZE = 5;

  for (let i = 0; i < mangaList.length; i += BATCH_SIZE) {
    const batch = mangaList.slice(i, i + BATCH_SIZE);
    const batchCovers = covers.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map((manga, idx) =>
        findBestSource(manga, batchCovers[idx]).catch(() => ({
          title: pickTitle(manga.attributes?.title),
          coverUrl: batchCovers[idx],
          sourceUrl: `https://mangadex.org/title/${manga.id}`,
          source: "mangadex" as const,
          sourceId: manga.id,
          chapterCount: 0,
        })),
      ),
    );

    results.push(...batchResults);

    // Small delay between batches to avoid rate limits
    if (i + BATCH_SIZE < mangaList.length) {
      await delay(300);
    }
  }

  return NextResponse.json(
    { results },
    {
      headers: {
        "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
      },
    },
  );
}
