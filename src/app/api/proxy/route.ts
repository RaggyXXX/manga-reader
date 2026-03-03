import { NextRequest, NextResponse } from "next/server";

const ALLOWED_HOSTS = ["manhwazone.to", "www.manhwazone.to", "c4.manhwatop.com", "media.manhwazone.to", "official.lowee.us"];
const ALLORIGINS_GET = "https://api.allorigins.win/get?url=";
const ALLORIGINS_RAW = "https://api.allorigins.win/raw?url=";

const FETCH_TIMEOUT = 15000;

async function fetchWithTimeout(url: string, opts: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const resp = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timeout);
    return resp;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/** For HTML pages: fetch via allorigins server-side (bypasses Cloudflare + no CORS issues) */
async function fetchHtmlViaAllorigins(url: string): Promise<string | null> {
  // Strategy 1: allorigins /get (JSON wrapper)
  try {
    const resp = await fetchWithTimeout(ALLORIGINS_GET + encodeURIComponent(url));
    if (resp.ok) {
      const json = await resp.json();
      if (json.contents && json.contents.length > 200) {
        return json.contents;
      }
    }
  } catch { /* fall through */ }

  // Strategy 2: allorigins /raw
  try {
    const resp = await fetchWithTimeout(ALLORIGINS_RAW + encodeURIComponent(url));
    if (resp.ok) {
      const text = await resp.text();
      if (text && text.length > 200) {
        return text;
      }
    }
  } catch { /* fall through */ }

  return null;
}

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
    // For HTML requests: try allorigins server-side first (bypasses Cloudflare)
    if (!isImage) {
      const html = await fetchHtmlViaAllorigins(url);
      if (html) {
        return new NextResponse(html, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
          },
        });
      }
    }

    // Direct fetch (works for images, fallback for HTML)
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": isImage
        ? "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8"
        : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Referer": "https://manhwazone.to/",
    };

    const resp = await fetchWithTimeout(url, { headers });

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
