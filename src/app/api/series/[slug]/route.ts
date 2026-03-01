import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Series from "@/lib/models/Series";
import Chapter from "@/lib/models/Chapter";
import CrawlJob from "@/lib/models/CrawlJob";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  await connectDB();

  const series = await Series.findOne({ slug }).lean();
  if (!series) {
    return NextResponse.json({ error: "Series not found" }, { status: 404 });
  }

  const chapters = await Chapter.find({ seriesId: series._id })
    .sort({ number: 1 })
    .select("number title status pageCount")
    .lean();

  return NextResponse.json({ series, chapters });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  await connectDB();

  const series = await Series.findOne({ slug });
  if (!series) {
    return NextResponse.json({ error: "Series not found" }, { status: 404 });
  }

  await Chapter.deleteMany({ seriesId: series._id });
  await CrawlJob.deleteMany({ seriesId: series._id });
  await series.deleteOne();

  return NextResponse.json({ ok: true });
}
