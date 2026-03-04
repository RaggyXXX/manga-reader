import { NextRequest, NextResponse } from "next/server";

const MANGADEX_API = "https://api.mangadex.org";

export async function GET(req: NextRequest) {
  const chapterId = req.nextUrl.searchParams.get("chapterId");
  if (!chapterId) {
    return NextResponse.json({ error: "Missing chapterId parameter" }, { status: 400 });
  }

  try {
    const resp = await fetch(`${MANGADEX_API}/at-home/server/${chapterId}`, {
      headers: { "User-Agent": "MangaBlastPWA/1.0" },
    });

    if (!resp.ok) {
      return NextResponse.json(
        { error: `MangaDex at-home API returned ${resp.status}` },
        { status: resp.status }
      );
    }

    const json = await resp.json();
    const baseUrl = json.baseUrl;
    const hash = json.chapter.hash;
    // Use data-saver for smaller images (faster loading)
    const filenames: string[] = json.chapter.dataSaver || json.chapter.data;

    const imageUrls = filenames.map(
      (f: string) => `${baseUrl}/data-saver/${hash}/${f}`
    );

    return NextResponse.json(
      { imageUrls },
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
