import { NextRequest, NextResponse } from "next/server";
import { fetchWithH2 } from "@/lib/server/fetch-h2";

// Node.js runtime (not edge) — uses got + http2-wrapper for TLS fingerprint bypass

const ALLOWED_HOSTS = [
  "manhwazone.to",
  "www.manhwazone.to",
  "c2.manhwatop.com",
  "c4.manhwatop.com",
  "media.manhwazone.to",
  "official.lowee.us",
  "mangakatana.com",
  "www.mangakatana.com",
  "i1.mangakatana.com",
  "i2.mangakatana.com",
  "i3.mangakatana.com",
  "vymanga.com",
  "www.vymanga.com",
  "cdnxyz.xyz",
  "vycdn.net",
];

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

  const isImage = /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(parsed.pathname);

  try {
    const { body, contentType } = await fetchWithH2(url, isImage);

    // Validate HTML responses
    if (!isImage) {
      const head = body.slice(0, 500);
      if (
        head.includes("<title>Just a moment") ||
        head.includes("cf-challenge") ||
        head.includes("<title>Attention Required")
      ) {
        return NextResponse.json(
          { error: "Cloudflare challenge page returned" },
          { status: 502 }
        );
      }
    }

    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": isImage
          ? "public, max-age=86400, immutable"
          : "no-store, no-cache, must-revalidate",
        "CDN-Cache-Control": isImage ? "public, max-age=86400" : "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const isTimeout = message.includes("Timeout");
    return NextResponse.json(
      { error: isTimeout ? "Upstream timeout" : message },
      { status: isTimeout ? 504 : 502 }
    );
  }
}
