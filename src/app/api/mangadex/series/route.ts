import { NextRequest, NextResponse } from "next/server";

const MANGADEX_API = "https://api.mangadex.org";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
  }

  try {
    const resp = await fetch(
      `${MANGADEX_API}/manga/${id}?includes[]=cover_art`,
      { headers: { "User-Agent": "MangaBlastPWA/1.0" } }
    );
    if (!resp.ok) {
      return NextResponse.json({ error: `MangaDex API returned ${resp.status}` }, { status: resp.status });
    }

    const json = await resp.json();
    const manga = json.data;
    const attrs = manga.attributes;

    // Extract title (prefer English, fall back to first available)
    const title =
      attrs.title.en ||
      attrs.title.ja ||
      attrs.title["ja-ro"] ||
      Object.values(attrs.title)[0] ||
      "Unknown";

    // Extract cover URL
    let coverUrl = "";
    const coverRel = manga.relationships?.find(
      (r: { type: string }) => r.type === "cover_art"
    );
    if (coverRel?.attributes?.fileName) {
      coverUrl = `https://uploads.mangadex.org/covers/${id}/${coverRel.attributes.fileName}.512.jpg`;
    }

    return NextResponse.json(
      { title, coverUrl, sourceId: id },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
          "CDN-Cache-Control": "no-store",
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
