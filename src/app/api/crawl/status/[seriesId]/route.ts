import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Series from "@/lib/models/Series";
import Chapter from "@/lib/models/Chapter";
import CrawlJob from "@/lib/models/CrawlJob";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ seriesId: string }> }
) {
  const { seriesId } = await params;
  await connectDB();

  const series = await Series.findById(seriesId)
    .select("totalChapters crawledChapters status")
    .lean();

  if (!series) {
    return NextResponse.json({ error: "Series not found" }, { status: 404 });
  }

  const job = await CrawlJob.findOne({ seriesId, type: "chapters" })
    .sort({ createdAt: -1 })
    .lean();

  const pendingCount = await Chapter.countDocuments({ seriesId, status: "pending" });
  const crawledCount = await Chapter.countDocuments({ seriesId, status: "crawled" });
  const errorCount = await Chapter.countDocuments({ seriesId, status: "error" });

  return NextResponse.json({
    job: job
      ? {
          status: job.status,
          progress: job.progress,
          completed: job.completed,
          total: job.total,
        }
      : null,
    series: {
      totalChapters: series.totalChapters,
      crawledChapters: crawledCount,
      pendingChapters: pendingCount,
      errorChapters: errorCount,
    },
  });
}
