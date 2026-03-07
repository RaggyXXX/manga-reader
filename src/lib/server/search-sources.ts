import { fetchWithH2, postWithH2 } from "./fetch-h2";
import { mapMangaDexCardResult } from "../mangadex-card-result";
import type { SearchResult } from "../search-aggregation";

export function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
}

export async function searchMangaDex(q: string): Promise<SearchResult[]> {
  const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(q)}&includes[]=cover_art&limit=10&order[relevance]=desc`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`MangaDex API ${resp.status}`);
  const data = await resp.json();

  return (data.data || []).map((manga: Record<string, unknown>) => mapMangaDexCardResult(manga as never));
}

export async function searchMangaKatana(q: string): Promise<SearchResult[]> {
  const url = `https://mangakatana.com/?search=${encodeURIComponent(q)}&search_by=book_name`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`MangaKatana ${resp.status}`);
  if (resp.url.includes("/manga/")) return [];
  const html = await resp.text();

  const results: SearchResult[] = [];
  const hotIdx = html.indexOf("Hot Manga");
  const searchHtml = hotIdx > -1 ? html.slice(0, hotIdx) : html;
  const items = searchHtml.split(/class\s*=\s*["']item\b/);
  for (let i = 1; i < items.length && results.length < 10; i++) {
    const block = items[i];
    const imgMatch = block.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/);
    const coverUrl = imgMatch?.[1] || "";
    const titleMatch = block.match(/<h3[^>]*class\s*=\s*["']title["'][^>]*>\s*<a\s+href\s*=\s*["']([^"']+)["'][^>]*>([^<]+)<\/a>/);
    if (titleMatch) {
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

export async function searchManhwazone(q: string): Promise<SearchResult[]> {
  const url = `https://manhwazone.to/search?keyword=${encodeURIComponent(q)}`;
  const { body: html } = await fetchWithH2(url, false);

  const head = html.slice(0, 500);
  if (head.includes("<title>Just a moment") || head.includes("cf-challenge")) {
    throw new Error("Cloudflare challenge");
  }

  const results: SearchResult[] = [];
  const items = html.split(/<article\b/);
  for (let i = 1; i < items.length && results.length < 10; i++) {
    const block = items[i];
    const linkMatch = block.match(/<a\s+href\s*=\s*["'](\/series\/[^"']+)["']/);
    const imgMatch = block.match(/<img\s+src\s*=\s*["'](https?:\/\/[^"']+)["']/);
    const titleMatch = block.match(/<a\s+href\s*=\s*["']\/series\/[^"']+["'][^>]*class\s*=\s*["'][^"']*font-semibold[^"']*["'][^>]*>\s*([^<]+)</);
    const altMatch = block.match(/alt\s*=\s*["']([^"']+?)(?:\s+cover)?["']/);

    if (linkMatch) {
      const title = titleMatch?.[1]?.trim() || altMatch?.[1]?.trim() || "Unknown";
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

export async function searchWeebCentral(q: string): Promise<SearchResult[]> {
  const { body: html } = await postWithH2(
    "https://weebcentral.com/search/simple?location=main",
    `text=${encodeURIComponent(q)}`,
    { "HX-Request": "true" },
  );

  const results: SearchResult[] = [];
  const items = html.split(/<a\s+href="https:\/\/weebcentral\.com\/series\//);
  for (let i = 1; i < items.length && results.length < 10; i++) {
    const block = items[i];
    const idMatch = block.match(/^([A-Z0-9]+)\/([^"]*)"/)
    if (!idMatch) continue;
    const ulid = idMatch[1];
    const slug = idMatch[2];

    const titleMatch = block.match(/line-clamp-1[^>]*>([^<]+)</);
    const title = titleMatch?.[1]?.trim() || slug.replace(/-/g, " ");

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

export async function searchAtsumaru(q: string): Promise<SearchResult[]> {
  const url = `https://atsu.moe/collections/manga/documents/search?q=${encodeURIComponent(q)}&query_by=title,englishTitle,otherNames,authors&include_fields=id,title,englishTitle,poster,status,type&limit=10&num_typos=4&query_by_weights=4,3,2,1`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Atsumaru ${resp.status}`);
  const data = await resp.json();

  return (data.hits || []).map((hit: Record<string, unknown>) => {
    const doc = hit.document as Record<string, unknown>;
    const rawPoster = doc.poster;
    let coverUrl = "";
    if (typeof rawPoster === "string" && rawPoster) {
      coverUrl = rawPoster.startsWith("http") ? rawPoster : `https://atsu.moe${rawPoster}`;
    } else if (rawPoster && typeof rawPoster === "object") {
      const poster = rawPoster as Record<string, string>;
      coverUrl = poster.mediumImage
        ? `https://atsu.moe/${poster.mediumImage}`
        : poster.smallImage
          ? `https://atsu.moe/${poster.smallImage}`
          : "";
    }

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

export async function searchMangaBuddy(q: string): Promise<SearchResult[]> {
  const resp = await fetch(`https://mangabuddy.com/api/manga/search?q=${encodeURIComponent(q)}`);
  if (!resp.ok) throw new Error(`MangaBuddy ${resp.status}`);
  const html = await resp.text();

  const results: SearchResult[] = [];
  const items = html.split(/class="novel__item"/);
  for (let i = 1; i < items.length && results.length < 10; i++) {
    const block = items[i];
    const linkMatch = block.match(/<a\s+title="([^"]*)"[^>]*href="\/([^"]+)"/);
    if (!linkMatch) continue;
    const title = linkMatch[1].trim();
    const slug = linkMatch[2];

    const imgMatch = block.match(/<img\s+src="(https:\/\/res\.mbbcdn\.com[^"]+)"/);
    const coverUrl = imgMatch?.[1] || "";

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
