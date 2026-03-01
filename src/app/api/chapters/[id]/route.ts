import { NextRequest, NextResponse } from "next/server";
import type { Browser } from "puppeteer-core";
import { connectDB } from "@/lib/db";
import Chapter from "@/lib/models/Chapter";
import Series from "@/lib/models/Series";
import { getBrowser, extractChapterImages, discoverChapters } from "@/lib/crawler";

const CRAWL_TIMEOUT = 90000;
const REFRESH_TIMEOUT = 25000;

/** GET — Read-only. Returns chapter data or pending status. Never crawls. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await connectDB();

  const chapter = await Chapter.findById(id).lean();
  if (!chapter) {
    return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
  }

  if (chapter.status === "crawled" && chapter.imageUrls.length > 0) {
    return NextResponse.json({ chapter });
  }

  // Not yet crawled — return pending status (client should POST to trigger)
  return NextResponse.json({
    chapter: {
      _id: chapter._id,
      number: chapter.number,
      title: chapter.title,
      status: chapter.status,
      imageUrls: [],
      pageCount: 0,
    },
  });
}

/**
 * Refresh the chapter's sourceUrl by re-discovering from the series page.
 * Returns the fresh URL or the existing one if refresh fails.
 */
async function refreshSingleChapterUrl(
  browser: Browser,
  seriesId: string,
  chapterNumber: number,
  currentUrl: string
): Promise<string> {
  try {
    const series = await Series.findById(seriesId).lean();
    if (!series?.sourceUrl) return currentUrl;

    const result = await discoverChapters(browser, series.sourceUrl);
    const match = result.chapters.find((ch) => ch.number === chapterNumber);
    if (!match) return currentUrl;

    if (match.url !== currentUrl) {
      console.log(`[Refresh] Chapter ${chapterNumber} URL updated: ${currentUrl} → ${match.url}`);
      await Chapter.updateOne(
        { seriesId, number: chapterNumber },
        { sourceUrl: match.url }
      );
      return match.url;
    }
    return currentUrl;
  } catch (err) {
    console.error(`[Refresh] Failed to refresh chapter ${chapterNumber} URL:`, err);
    return currentUrl;
  }
}

/** POST — Trigger on-demand crawl for a pending chapter with timeout protection.
 *  Use ?force=true to re-crawl chapters with bad data (e.g., too few images from stale URLs).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const force = req.nextUrl.searchParams.get("force") === "true";
  await connectDB();

  const chapter = await Chapter.findById(id).lean();
  if (!chapter) {
    return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
  }

  // Already crawled — return it (unless force re-crawl requested)
  if (!force && chapter.status === "crawled" && chapter.imageUrls.length > 0) {
    return NextResponse.json({ chapter });
  }

  // Mark as crawling to prevent double crawl
  await Chapter.updateOne({ _id: id }, { status: "crawling" });

  const browserRef: { current: Browser | null } = { current: null };
  try {
    // Step 1: Launch browser and refresh URL (with separate timeout)
    const b = await getBrowser();
    browserRef.current = b;

    let chapterUrl = chapter.sourceUrl;
    try {
      const refreshPromise = refreshSingleChapterUrl(
        b,
        chapter.seriesId.toString(),
        chapter.number,
        chapter.sourceUrl
      );
      const refreshTimeout = new Promise<string>((resolve) =>
        setTimeout(() => resolve(chapter.sourceUrl), REFRESH_TIMEOUT)
      );
      chapterUrl = await Promise.race([refreshPromise, refreshTimeout]);
    } catch {
      // Refresh failed — use existing URL
    }

    // Step 2: Crawl with full timeout budget
    const crawlPromise = extractChapterImages(b, chapterUrl);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Crawl timeout")), CRAWL_TIMEOUT)
    );

    const imageUrls = await Promise.race([crawlPromise, timeoutPromise]);

    const updated = await Chapter.findByIdAndUpdate(
      id,
      {
        imageUrls,
        pageCount: imageUrls.length,
        status: imageUrls.length > 0 ? "crawled" : "error",
        errorMessage: imageUrls.length === 0 ? "No images found" : undefined,
        crawledAt: new Date(),
      },
      { new: true }
    ).lean();

    if (imageUrls.length > 0) {
      const crawledCount = await Chapter.countDocuments({
        seriesId: chapter.seriesId,
        status: "crawled",
      });
      await Series.updateOne(
        { _id: chapter.seriesId },
        { crawledChapters: crawledCount }
      );
    }

    return NextResponse.json({ chapter: updated });
  } catch (err) {
    await Chapter.updateOne(
      { _id: id },
      { status: "error", errorMessage: String(err) }
    );
    return NextResponse.json(
      { error: "Failed to crawl chapter", details: String(err) },
      { status: 500 }
    );
  } finally {
    if (browserRef.current) {
      try { await browserRef.current.close(); } catch { /* ignore */ }
    }
  }
}
