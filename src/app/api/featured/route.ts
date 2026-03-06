import { NextResponse } from "next/server";

interface FeaturedResult {
  title: string;
  coverUrl: string;
  sourceUrl: string;
  source: "mangadex";
  sourceId?: string;
  availableLanguages?: string[];
  chapterCount?: number;
}

function pickTitle(titleObj: Record<string, string> | undefined): string {
  if (!titleObj) return "Unknown";
  return titleObj.en || titleObj.ja || titleObj["ja-ro"] || Object.values(titleObj)[0] || "Unknown";
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
  const results: FeaturedResult[] = (data.data || []).map((manga: Record<string, unknown>) => {
    const id = manga.id as string;
    const attrs = manga.attributes as Record<string, unknown>;
    const title = pickTitle(attrs.title as Record<string, string> | undefined);
    const lastChapter = attrs.lastChapter as string | undefined;

    let coverFileName = "";
    const relationships = manga.relationships as Array<Record<string, unknown>>;
    for (const relationship of relationships || []) {
      if (relationship.type !== "cover_art") continue;
      const relAttrs = relationship.attributes as Record<string, string> | undefined;
      coverFileName = relAttrs?.fileName || "";
      break;
    }

    return {
      title,
      coverUrl: coverFileName ? `https://uploads.mangadex.org/covers/${id}/${coverFileName}.256.jpg` : "",
      sourceUrl: `https://mangadex.org/title/${id}`,
      source: "mangadex",
      sourceId: id,
      availableLanguages: (attrs.availableTranslatedLanguages as string[]) || ["en"],
      chapterCount: lastChapter ? parseInt(lastChapter, 10) || undefined : undefined,
    };
  });

  return NextResponse.json(
    { results },
    {
      headers: {
        "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
      },
    },
  );
}
