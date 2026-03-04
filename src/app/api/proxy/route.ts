import { NextRequest, NextResponse } from "next/server";

const ALLOWED_HOSTS = ["manhwazone.to", "www.manhwazone.to", "c2.manhwatop.com", "c4.manhwatop.com", "media.manhwazone.to", "official.lowee.us"];

// Netlify free tier: 10s function timeout. Each service gets 8s max.
const FETCH_TIMEOUT = 8000;

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

function isErrorPage(html: string): boolean {
  return (
    html.includes("<title>Not Found") ||
    html.includes("<title>Just a moment") ||
    html.includes("cf-challenge") ||
    html.includes("<title>Access denied") ||
    html.includes("<title>Error")
  );
}

function isValidHtml(html: string | null | undefined): html is string {
  return !!html && html.length > 200 && !isErrorPage(html);
}

/** Attempt to fetch HTML via a single proxy service */
async function tryProxy(
  name: string,
  proxyUrl: string,
  extractHtml: (resp: Response) => Promise<string | null>
): Promise<string> {
  const resp = await fetchWithTimeout(proxyUrl);
  if (!resp.ok) throw new Error(`${name}: HTTP ${resp.status}`);
  const html = await extractHtml(resp);
  if (!isValidHtml(html)) throw new Error(`${name}: invalid/error HTML`);
  return html;
}

/** Attempt direct fetch with full browser headers */
async function tryDirectFetch(url: string): Promise<string> {
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://manhwazone.to/",
    "Sec-Ch-Ua": '"Chromium";v="131", "Not_A Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "Cache-Control": "max-age=0",
  };

  const resp = await fetchWithTimeout(url, { headers, redirect: "follow" });
  if (!resp.ok) throw new Error(`direct: HTTP ${resp.status}`);

  const contentType = resp.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
    throw new Error("direct: not HTML (Cloudflare challenge?)");
  }

  const text = await resp.text();
  if (!isValidHtml(text)) throw new Error("direct: invalid/error HTML");
  return text;
}

async function extractJson(resp: Response): Promise<string | null> {
  try {
    const json = await resp.json();
    return json.contents || null;
  } catch { return null; }
}

async function extractText(resp: Response): Promise<string | null> {
  return resp.text();
}

/**
 * Race all proxy services + direct fetch in parallel.
 * Returns the first valid HTML response.
 */
async function fetchHtmlParallel(url: string): Promise<string | null> {
  const encoded = encodeURIComponent(url);

  const attempts: Promise<string>[] = [
    tryProxy("allorigins-win", `https://api.allorigins.win/get?url=${encoded}`, extractJson),
    tryProxy("allorigins-hexlet", `https://api.allorigins.hexlet.app/get?url=${encoded}`, extractJson),
    tryProxy("corsproxy-io", `https://corsproxy.io/?${encoded}`, extractText),
    tryProxy("allorigins-win-raw", `https://api.allorigins.win/raw?url=${encoded}`, extractText),
    tryDirectFetch(url),
  ];

  try {
    return await Promise.any(attempts);
  } catch {
    // All attempts failed
    return null;
  }
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
    // For HTML requests: race all proxy services in parallel
    if (!isImage) {
      const html = await fetchHtmlParallel(url);
      if (html) {
        return new NextResponse(html, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
          },
        });
      }

      return NextResponse.json(
        { error: "All proxy services failed for this URL" },
        { status: 502 }
      );
    }

    // Direct fetch for images
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Referer": "https://manhwazone.to/",
    };

    const resp = await fetchWithTimeout(url, { headers });

    if (!resp.ok) {
      return NextResponse.json({ error: `Upstream ${resp.status}` }, { status: resp.status });
    }

    const contentType = resp.headers.get("content-type") || "application/octet-stream";

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
