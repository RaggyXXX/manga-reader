import { NextResponse } from "next/server";
import { mapMangaDexCardResult } from "@/lib/mangadex-card-result";

type FeaturedResult = ReturnType<typeof mapMangaDexCardResult>;

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
  const results: FeaturedResult[] = (data.data || []).map((manga: Record<string, unknown>) => mapMangaDexCardResult(manga as never));

  return NextResponse.json(
    { results },
    {
      headers: {
        "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
      },
    },
  );
}
