import { NextRequest, NextResponse } from "next/server";

const BLOCKED_PATTERNS = [
  /^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i,
  /^file:/i,
];

const FETCH_TIMEOUT = 15000;
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Only HTTPS URLs allowed" }, { status: 403 });
  }

  if (BLOCKED_PATTERNS.some((p) => p.test(url))) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 403 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        Referer: parsed.origin + "/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${resp.status}` },
        { status: resp.status }
      );
    }

    // Check content length if provided
    const contentLength = resp.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_SIZE) {
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }

    const contentType = resp.headers.get("content-type") || "image/webp";
    const body = resp.body;

    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const isTimeout = message.includes("abort");
    return NextResponse.json(
      { error: isTimeout ? "Upstream timeout" : "Failed to fetch image" },
      { status: isTimeout ? 504 : 502 }
    );
  }
}
