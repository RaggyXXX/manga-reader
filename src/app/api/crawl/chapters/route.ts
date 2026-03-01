import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Series from "@/lib/models/Series";
import Chapter from "@/lib/models/Chapter";
import CrawlJob from "@/lib/models/CrawlJob";
import { getBrowser, extractChapterImages } from "@/lib/crawler";

const BATCH_SIZE = 20;
const DELAY_BETWEEN_CHAPTERS = 2000;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { seriesId } = body as { seriesId?: string };

  if (!seriesId) {
    return NextResponse.json({ error: "Missing seriesId" }, { status: 400 });
  }

  await connectDB();

  const series = await Series.findById(seriesId);
  if (!series) {
    return NextResponse.json({ error: "Series not found" }, { status: 404 });
  }

  // Find pending chapters
  const pendingChapters = await Chapter.find({ seriesId, status: "pending" })
    .sort({ number: 1 })
    .limit(BATCH_SIZE)
    .lean();

  if (pendingChapters.length === 0) {
    return NextResponse.json({ message: "All chapters already crawled", completed: true });
  }

  // Create/update crawl job
  const job = await CrawlJob.findOneAndUpdate(
    { seriesId, type: "chapters", status: { $in: ["queued", "running"] } },
    {
      seriesId,
      type: "chapters",
      status: "running",
      total: pendingChapters.length,
      completed: 0,
      progress: 0,
      startedAt: new Date(),
    },
    { upsert: true, new: true }
  );

  // Run batch crawl (this runs inline for dev — on Netlify use background function)
  crawlBatch(seriesId, pendingChapters, job._id.toString()).catch(console.error);

  return NextResponse.json({
    jobId: job._id,
    status: "running",
    total: pendingChapters.length,
  });
}

async function crawlBatch(
  seriesId: string,
  chapters: Array<{ _id: any; sourceUrl: string; number: number }>,
  jobId: string
) {
  let browser;
  try {
    browser = await getBrowser();
    let completed = 0;

    for (const chapter of chapters) {
      try {
        const imageUrls = await extractChapterImages(browser, chapter.sourceUrl);

        await Chapter.updateOne(
          { _id: chapter._id },
          {
            imageUrls,
            pageCount: imageUrls.length,
            status: imageUrls.length > 0 ? "crawled" : "error",
            errorMessage: imageUrls.length === 0 ? "No images found" : undefined,
            crawledAt: new Date(),
          }
        );
        completed++;
      } catch (err) {
        await Chapter.updateOne(
          { _id: chapter._id },
          { status: "error", errorMessage: String(err) }
        );
        completed++;
      }

      // Update job progress
      const progress = Math.round((completed / chapters.length) * 100);
      await CrawlJob.updateOne({ _id: jobId }, { completed, progress });

      // Update series crawled count
      const crawledCount = await Chapter.countDocuments({ seriesId, status: "crawled" });
      await Series.updateOne({ _id: seriesId }, { crawledChapters: crawledCount });

      // Delay
      if (completed < chapters.length) {
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_CHAPTERS));
      }
    }

    // Mark job complete
    await CrawlJob.updateOne(
      { _id: jobId },
      { status: "completed", completedAt: new Date(), progress: 100 }
    );

    // Update series status
    const total = await Chapter.countDocuments({ seriesId });
    const crawled = await Chapter.countDocuments({ seriesId, status: "crawled" });
    await Series.updateOne(
      { _id: seriesId },
      {
        crawledChapters: crawled,
        status: crawled >= total ? "complete" : "partial",
        lastSynced: new Date(),
      }
    );
  } catch (err) {
    await CrawlJob.updateOne(
      { _id: jobId },
      { status: "failed", errorMessage: String(err), completedAt: new Date() }
    );
  } finally {
    if (browser) await browser.close();
  }
}
