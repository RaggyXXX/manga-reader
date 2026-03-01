import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Series from "@/lib/models/Series";
import Chapter from "@/lib/models/Chapter";
import CrawlJob from "@/lib/models/CrawlJob";
import { getBrowser, extractChapterImages, discoverChapters } from "@/lib/crawler";
import type { Browser } from "puppeteer-core";

const BATCH_SIZE = 20;
const DELAY_BETWEEN_CHAPTERS = 1000;
const BROWSER_RECYCLE_EVERY = 5;
const MAX_CONSECUTIVE_ERRORS = 3;

/**
 * Re-discover chapter URLs from the series page and update stale DB entries.
 * Sites like manhwazone.to change URL slugs over time, causing stored URLs to 404.
 */
async function refreshChapterUrls(
  browser: Browser,
  seriesId: string,
  seriesUrl: string,
  chapterNumbers: number[]
): Promise<Map<number, string>> {
  const freshMap = new Map<number, string>();

  try {
    console.log(`[Refresh] Re-discovering chapter URLs from: ${seriesUrl}`);
    const result = await discoverChapters(browser, seriesUrl);

    for (const ch of result.chapters) {
      freshMap.set(ch.number, ch.url);
    }

    // Update stale URLs in DB
    let updated = 0;
    for (const num of chapterNumbers) {
      const freshUrl = freshMap.get(num);
      if (!freshUrl) continue;

      const res = await Chapter.updateOne(
        { seriesId, number: num, sourceUrl: { $ne: freshUrl } },
        { sourceUrl: freshUrl }
      );
      if (res.modifiedCount > 0) updated++;
    }

    if (updated > 0) {
      console.log(`[Refresh] Updated ${updated} stale chapter URLs`);
    } else {
      console.log(`[Refresh] All chapter URLs are current`);
    }
  } catch (err) {
    console.error(`[Refresh] Failed to re-discover chapters:`, err);
    // Non-fatal — will proceed with existing URLs
  }

  return freshMap;
}

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

  // Include both "pending" and "error" chapters (error chapters get a retry with fresh URLs)
  const pendingChapters = await Chapter.find({
    seriesId,
    status: { $in: ["pending", "error"] },
  })
    .sort({ number: 1 })
    .limit(BATCH_SIZE)
    .lean();

  if (pendingChapters.length === 0) {
    return NextResponse.json({ message: "All chapters already crawled", completed: true });
  }

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

  crawlBatch(seriesId, series.sourceUrl, pendingChapters, job._id.toString()).catch(console.error);

  return NextResponse.json({
    jobId: job._id,
    status: "running",
    total: pendingChapters.length,
  });
}

async function crawlBatch(
  seriesId: string,
  seriesUrl: string,
  chapters: Array<{ _id: any; sourceUrl: string; number: number }>,
  jobId: string
) {
  let browser;
  let consecutiveErrors = 0;

  try {
    browser = await getBrowser();

    // Refresh stale chapter URLs before crawling
    const freshUrls = await refreshChapterUrls(
      browser,
      seriesId,
      seriesUrl,
      chapters.map((c) => c.number)
    );

    // Update the in-memory chapter list with fresh URLs
    for (const chapter of chapters) {
      const freshUrl = freshUrls.get(chapter.number);
      if (freshUrl) {
        chapter.sourceUrl = freshUrl;
      }
    }

    let completed = 0;

    for (const chapter of chapters) {
      // Recycle browser periodically to prevent memory leaks
      if (completed > 0 && completed % BROWSER_RECYCLE_EVERY === 0) {
        console.log(`[Batch] Recycling browser after ${completed} chapters...`);
        try { await browser.close(); } catch { /* ignore */ }
        browser = await getBrowser();
      }

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
        consecutiveErrors = 0;
      } catch (err) {
        console.error(`[Batch] Error crawling chapter ${chapter.number}:`, err);
        await Chapter.updateOne(
          { _id: chapter._id },
          { status: "error", errorMessage: String(err) }
        );
        completed++;
        consecutiveErrors++;

        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.error(`[Batch] ${MAX_CONSECUTIVE_ERRORS} consecutive errors, aborting batch.`);
          break;
        }
      }

      // Update job progress
      const progress = Math.round((completed / chapters.length) * 100);
      await CrawlJob.updateOne({ _id: jobId }, { completed, progress });

      // Update series crawled count every 5 chapters (not every single one)
      if (completed % 5 === 0 || completed === chapters.length) {
        const crawledCount = await Chapter.countDocuments({ seriesId, status: "crawled" });
        await Series.updateOne({ _id: seriesId }, { crawledChapters: crawledCount });
      }

      // Delay between chapters
      if (completed < chapters.length) {
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_CHAPTERS));
      }
    }

    // Mark job complete
    await CrawlJob.updateOne(
      { _id: jobId },
      { status: "completed", completedAt: new Date(), progress: 100 }
    );

    // Final series update
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
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
  }
}
