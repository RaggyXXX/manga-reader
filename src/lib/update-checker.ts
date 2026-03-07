import type { StoredSeries } from "./manga-store";
import { isSourceSyncable } from "./source-health";

/**
 * Lightweight check: counts remote chapters and compares to local totalChapters.
 * Returns the number of new chapters available (0 if none or on error).
 */
export async function checkForUpdates(series: StoredSeries): Promise<number> {
  try {
    const source = series.source || "manhwazone";
    if (!isSourceSyncable(source)) return 0;

    let remoteCount = 0;

    if (source === "mangadex") {
      remoteCount = await countMangaDexChapters(series);
    } else if (source === "atsumaru") {
      remoteCount = await countAtsumaruChapters(series);
    } else {
      remoteCount = await countScrapedChapters(series.sourceUrl, source);
    }

    return Math.max(0, remoteCount - series.totalChapters);
  } catch {
    return 0;
  }
}

async function countMangaDexChapters(series: StoredSeries): Promise<number> {
  if (!series.sourceId) return 0;
  const lang = series.preferredLanguage || "en";
  const res = await fetch(`/api/mangadex/chapters?mangaId=${series.sourceId}&lang=${lang}`);
  if (!res.ok) return 0;
  const data = await res.json();
  return Array.isArray(data.chapters) ? data.chapters.length : 0;
}

async function countAtsumaruChapters(series: StoredSeries): Promise<number> {
  if (!series.sourceId) return 0;
  const res = await fetch(`https://atsu.moe/api/manga/allChapters?mangaId=${series.sourceId}`);
  if (!res.ok) return 0;
  const data = await res.json();
  return Array.isArray(data.chapters) ? data.chapters.length : 0;
}

async function countScrapedChapters(sourceUrl: string, source: string): Promise<number> {
  const res = await fetch(`/api/scrape?url=${encodeURIComponent(sourceUrl)}`);
  if (!res.ok) return 0;
  const html = await res.text();

  switch (source) {
    case "mangakatana":
      return countMatches(html, /\/c\d+/g);
    case "weebcentral":
      return countMatches(html, /\/chapters\/[A-Z0-9]+/g);
    case "mangabuddy":
      return countMangaBuddyChapters(html);
    case "manhwazone":
    default:
      return countManhwazoneChapters(html);
  }
}

function countManhwazoneChapters(html: string): number {
  // Count unique chapter hrefs, excluding follow-next links
  const matches = html.match(/href="[^"]*\/chapter-\d+[^"]*"/g);
  if (!matches) return 0;
  const unique = new Set(matches.map((m) => {
    const match = m.match(/chapter-(\d+)/);
    return match ? match[1] : null;
  }).filter(Boolean));
  return unique.size;
}

function countMangaBuddyChapters(html: string): number {
  const matches = html.match(/chapter-(\d+(?:\.\d+)?)/g);
  if (!matches) return 0;
  const nums = matches.map((m) => {
    const n = m.match(/chapter-(\d+)/);
    return n ? parseInt(n[1], 10) : 0;
  });
  return Math.max(...nums, 0);
}

function countMatches(html: string, pattern: RegExp): number {
  const matches = html.match(pattern);
  if (!matches) return 0;
  // Deduplicate
  return new Set(matches).size;
}
