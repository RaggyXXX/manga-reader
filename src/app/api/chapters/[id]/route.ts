import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Chapter from "@/lib/models/Chapter";
import Series from "@/lib/models/Series";
import { getBrowser, extractChapterImages } from "@/lib/crawler";

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

  // If already crawled, return immediately
  if (chapter.status === "crawled" && chapter.imageUrls.length > 0) {
    return NextResponse.json({ chapter });
  }

  // On-demand crawl
  try {
    const browser = await getBrowser();
    try {
      const imageUrls = await extractChapterImages(browser, chapter.sourceUrl);

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

      // Update series crawled count
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
    } finally {
      await browser.close();
    }
  } catch (err) {
    await Chapter.updateOne(
      { _id: id },
      { status: "error", errorMessage: String(err) }
    );
    return NextResponse.json(
      { error: "Failed to crawl chapter", details: String(err) },
      { status: 500 }
    );
  }
}
