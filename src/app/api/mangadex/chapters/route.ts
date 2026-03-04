import { NextRequest, NextResponse } from "next/server";

const MANGADEX_API = "https://api.mangadex.org";
const PAGE_LIMIT = 500;
const RATE_DELAY = 250; // ms between API calls

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function GET(req: NextRequest) {
  const mangaId = req.nextUrl.searchParams.get("mangaId");
  const lang = req.nextUrl.searchParams.get("lang") || "en";

  if (!mangaId) {
    return NextResponse.json({ error: "Missing mangaId parameter" }, { status: 400 });
  }

  try {
    const chapters: { id: string; chapter: string; title: string; volume: string | null }[] = [];
    let offset = 0;
    let total = Infinity;

    while (offset < total) {
      const url = `${MANGADEX_API}/manga/${mangaId}/feed?translatedLanguage[]=${lang}&order[chapter]=asc&limit=${PAGE_LIMIT}&offset=${offset}&includes[]=scanlation_group`;

      const resp = await fetch(url, {
        headers: { "User-Agent": "MangaReaderPWA/1.0" },
      });

      if (!resp.ok) {
        return NextResponse.json(
          { error: `MangaDex API returned ${resp.status}` },
          { status: resp.status }
        );
      }

      const json = await resp.json();
      total = json.total;

      for (const ch of json.data) {
        const attrs = ch.attributes;
        chapters.push({
          id: ch.id,
          chapter: attrs.chapter || "0",
          title: attrs.title || `Chapter ${attrs.chapter || "0"}`,
          volume: attrs.volume || null,
        });
      }

      offset += PAGE_LIMIT;
      if (offset < total) await delay(RATE_DELAY);
    }

    // Deduplicate by chapter number (keep first occurrence)
    const seen = new Set<string>();
    const unique = chapters.filter((ch) => {
      if (seen.has(ch.chapter)) return false;
      seen.add(ch.chapter);
      return true;
    });

    return NextResponse.json(
      { chapters: unique, total: unique.length },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=300",
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
