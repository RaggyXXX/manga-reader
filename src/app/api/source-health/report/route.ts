import { NextRequest, NextResponse } from "next/server";
import type { MangaSource } from "@/lib/manga-store";
import { ALL_SOURCES, recordSourceFailure, recordSourceSuccess, syncSourceHealthFromStore, type SourceFailureSignal } from "@/lib/source-health";

interface SourceHealthReportPayload {
  source?: MangaSource;
  status?: "success" | "failure";
  reason?: string;
  signal?: SourceFailureSignal;
}

export async function POST(req: NextRequest) {
  const body = await req.json() as SourceHealthReportPayload;
  if (!body.source || !ALL_SOURCES.includes(body.source) || !body.status) {
    return NextResponse.json({ error: "Invalid source health report payload" }, { status: 400 });
  }

  await syncSourceHealthFromStore();

  if (body.status === "success") {
    await recordSourceSuccess(body.source);
  } else {
    await recordSourceFailure(body.source, body.reason, Date.now(), body.signal || "strong");
  }

  return new NextResponse(null, { status: 204 });
}
