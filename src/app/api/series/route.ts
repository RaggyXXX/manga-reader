import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Series from "@/lib/models/Series";
import Chapter from "@/lib/models/Chapter";
import { getBrowser, discoverChapters } from "@/lib/crawler";

export async function GET() {
  await connectDB();
  const series = await Series.find({}).sort({ updatedAt: -1 }).lean();
  return NextResponse.json({ series });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { url } = body as { url?: string };

  if (!url || !url.includes("manhwazone.to/series/")) {
    return NextResponse.json(
      { error: "Please provide a valid manhwazone.to series URL" },
      { status: 400 }
    );
  }

  // Extract slug from URL
  const urlPath = new URL(url).pathname;
  const slugMatch = urlPath.match(/\/series\/([^/]+)/);
  if (!slugMatch) {
    return NextResponse.json({ error: "Could not extract series slug from URL" }, { status: 400 });
  }
  const slug = slugMatch[1];

  await connectDB();

  // Check if already exists
  const existing = await Series.findOne({ slug });
  if (existing) {
    return NextResponse.json({ series: existing }, { status: 200 });
  }

  // Create series in discovering state
  const series = await Series.create({
    title: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    slug,
    sourceUrl: url.replace(/\/$/, ""),
    status: "discovering",
  });

  // Run discovery inline (fast, ~10s)
  try {
    const browser = await getBrowser();
    try {
      const result = await discoverChapters(browser, url);

      // Update series with discovered data
      series.title = result.title;
      series.coverUrl = result.coverUrl;
      series.totalChapters = result.chapters.length;
      series.status = "partial";
      series.lastSynced = new Date();
      await series.save();

      // Bulk insert chapter stubs
      if (result.chapters.length > 0) {
        const chapterDocs = result.chapters.map((ch) => ({
          seriesId: series._id,
          number: ch.number,
          title: ch.title,
          sourceUrl: ch.url,
          status: "pending" as const,
        }));
        await Chapter.insertMany(chapterDocs, { ordered: false }).catch(() => {
          // Ignore duplicate key errors on retry
        });
      }
    } finally {
      await browser.close();
    }

    const updated = await Series.findById(series._id).lean();
    return NextResponse.json({ series: updated }, { status: 201 });
  } catch (err) {
    // Discovery failed, but series is created — user can retry
    series.status = "partial";
    await series.save();
    return NextResponse.json(
      { series: series.toObject(), warning: "Discovery failed, try syncing later" },
      { status: 201 }
    );
  }
}
