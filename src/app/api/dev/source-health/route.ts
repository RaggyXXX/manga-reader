import { NextRequest, NextResponse } from "next/server";
import { ALL_SOURCES, getAllSourceAvailability, markSourceBroken, resetSourceHealthForTests, setOutdatedSources, syncSourceHealthFromStore } from "@/lib/source-health";
import { clearSourceHealthStore } from "@/lib/source-health-store";
import type { MangaSource } from "@/lib/manga-store";

function ensureDevMode() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  return null;
}

export async function GET() {
  const blocked = ensureDevMode();
  if (blocked) return blocked;
  await syncSourceHealthFromStore();
  return NextResponse.json({ sources: getAllSourceAvailability() });
}

export async function POST(req: NextRequest) {
  const blocked = ensureDevMode();
  if (blocked) return blocked;

  const body = await req.json() as {
    outdated?: MangaSource[];
    broken?: Array<{ source: MangaSource; reason?: string }>;
  };

  await clearSourceHealthStore();
  resetSourceHealthForTests();
  setOutdatedSources((body.outdated || []).filter((source): source is MangaSource => ALL_SOURCES.includes(source)));
  for (const entry of body.broken || []) {
    if (ALL_SOURCES.includes(entry.source)) {
      await markSourceBroken(entry.source, entry.reason);
    }
  }

  await syncSourceHealthFromStore();
  return NextResponse.json({ sources: getAllSourceAvailability() });
}

export async function DELETE() {
  const blocked = ensureDevMode();
  if (blocked) return blocked;
  await clearSourceHealthStore();
  resetSourceHealthForTests();
  setOutdatedSources([]);
  await syncSourceHealthFromStore();
  return NextResponse.json({ sources: getAllSourceAvailability() });
}
