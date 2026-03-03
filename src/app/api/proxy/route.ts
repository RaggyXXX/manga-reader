import { NextRequest, NextResponse } from "next/server";

const ALLOWED_HOSTS = ["manhwazone.to", "www.manhwazone.to", "c4.manhwatop.com", "media.manhwazone.to", "official.lowee.us"];

const FETCH_TIMEOUT = 15000;

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

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const isImage = /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(parsed.pathname);
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": isImage
        ? "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8"
        : "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Referer": "https://manhwazone.to/",
    };

    const resp = await fetch(url, { signal: controller.signal, headers });
    clearTimeout(timeout);

    if (!resp.ok) {
      return NextResponse.json({ error: `Upstream ${resp.status}` }, { status: resp.status });
    }

    const contentType = resp.headers.get("content-type") || "application/octet-stream";
    const isHtml = contentType.includes("text/html");

    if (isHtml) {
      const text = await resp.text();
      return new NextResponse(text, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache",
        },
      });
    }

    return new NextResponse(resp.body, {
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const isTimeout = message.includes("abort");
    return NextResponse.json(
      { error: isTimeout ? "Upstream timeout" : "Fetch failed" },
      { status: isTimeout ? 504 : 502 }
    );
  }
}
