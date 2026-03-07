import { NextRequest, NextResponse } from "next/server";
import { collectSearchResults, type SearchResult } from "@/lib/search-aggregation";
import { syncSourceHealthFromStore } from "@/lib/source-health";
import { recheckDueSources } from "@/lib/server/source-health-recheck";
import {
  searchMangaDex,
  searchMangaKatana,
  searchManhwazone,
  searchWeebCentral,
  searchAtsumaru,
  searchMangaBuddy,
} from "@/lib/server/search-sources";

// Node.js runtime (not edge) — needs got + http2-wrapper for Manhwazone

// ── Main handler ──

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json(
      { error: "Query must be at least 2 characters" },
      { status: 400 },
    );
  }

  await syncSourceHealthFromStore();
  await recheckDueSources();

  const sources: Array<{ name: SearchResult["source"]; fn: () => Promise<SearchResult[]> }> = [
    { name: "mangadex", fn: () => searchMangaDex(q) },
    { name: "mangakatana", fn: () => searchMangaKatana(q) },
    { name: "manhwazone", fn: () => searchManhwazone(q) },
    { name: "weebcentral", fn: () => searchWeebCentral(q) },
    { name: "atsumaru", fn: () => searchAtsumaru(q) },
    { name: "mangabuddy", fn: () => searchMangaBuddy(q) },
  ];

  const { results, errors } = await collectSearchResults(q, sources);

  return NextResponse.json(
    { results, errors },
    {
      headers: {
        "Cache-Control": "no-store",
        "CDN-Cache-Control": "no-store",
      },
    },
  );
}
