import { NextResponse } from "next/server";
import { getAllSourceAvailability, syncSourceHealthFromStore } from "@/lib/source-health";
import { recheckDueSources } from "@/lib/server/source-health-recheck";

export async function GET() {
  await syncSourceHealthFromStore();
  await recheckDueSources();

  return NextResponse.json(
    {
      sources: getAllSourceAvailability(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "CDN-Cache-Control": "no-store",
      },
    },
  );
}
