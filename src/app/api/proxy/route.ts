import { NextRequest, NextResponse } from "next/server";

// Run on Netlify Edge (Deno Deploy) instead of AWS Lambda — different IPs, better Cloudflare compat
export const runtime = "edge";

const ALLOWED_HOSTS = ["manhwazone.to", "www.manhwazone.to", "c2.manhwatop.com", "c4.manhwatop.com", "media.manhwazone.to", "official.lowee.us"];

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
    html.includes("<title>Attention Required")
  );
}

function looksLikeHtml(html: string): boolean {
  // Must contain an HTML tag somewhere in the first 500 chars
  // This filters out binary data (WEBP, images) that Cloudflare returns as challenges
  const head = html.slice(0, 500);
  return head.includes("<html") || head.includes("<!DOCTYPE") || head.includes("<!doctype") || head.includes("<HTML");
}

function isValidHtml(html: string | null | undefined): html is string {
  return !!html && html.length > 200 && looksLikeHtml(html) && !isErrorPage(html);
}

interface AttemptResult {
  name: string;
  ok: boolean;
  error?: string;
  status?: number;
  size?: number;
  contentType?: string;
}

/** Attempt to fetch HTML via a single proxy service — returns { html, diag } */
async function tryProxy(
  name: string,
  proxyUrl: string,
  extractHtml: (resp: Response) => Promise<string | null>
): Promise<{ html: string; diag: AttemptResult }> {
  const resp = await fetchWithTimeout(proxyUrl);
  if (!resp.ok) {
    throw { diag: { name, ok: false, error: `HTTP ${resp.status}`, status: resp.status } };
  }
  const html = await extractHtml(resp);
  const htmlLen = html?.length || 0;
  if (!isValidHtml(html)) {
    throw { diag: { name, ok: false, error: "invalid/error HTML", size: htmlLen } };
  }
  return { html, diag: { name, ok: true, size: html.length } };
}

/** Attempt direct fetch with full browser headers */
async function tryDirectFetch(url: string): Promise<{ html: string; diag: AttemptResult }> {
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Sec-Ch-Ua": '"Chromium";v="131", "Not_A Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "Cache-Control": "max-age=0",
  };

  const resp = await fetchWithTimeout(url, { headers, redirect: "follow" });
  if (!resp.ok) {
    throw { diag: { name: "direct", ok: false, error: `HTTP ${resp.status}`, status: resp.status } };
  }

  const contentType = resp.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
    throw { diag: { name: "direct", ok: false, error: `not HTML: ${contentType}`, contentType } };
  }

  const text = await resp.text();
  const textLen = text?.length || 0;
  if (!isValidHtml(text)) {
    throw { diag: { name: "direct", ok: false, error: "invalid/error HTML", size: textLen } };
  }
  return { html: text, diag: { name: "direct", ok: true, size: text.length } };
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
 * Returns { html, diagnostics }.
 */
async function fetchHtmlParallel(url: string): Promise<{ html: string | null; diagnostics: AttemptResult[] }> {
  const encoded = encodeURIComponent(url);

  const attempts = [
    tryProxy("allorigins-win", `https://api.allorigins.win/get?url=${encoded}`, extractJson),
    tryProxy("allorigins-hexlet", `https://api.allorigins.hexlet.app/get?url=${encoded}`, extractJson),
    tryProxy("allorigins-win-raw", `https://api.allorigins.win/raw?url=${encoded}`, extractText),
    tryDirectFetch(url),
  ];

  // Collect all results for diagnostics
  const settled = await Promise.allSettled(attempts);
  const diagnostics: AttemptResult[] = [];

  for (const result of settled) {
    if (result.status === "fulfilled") {
      diagnostics.push(result.value.diag);
    } else {
      const reason = result.reason;
      if (reason?.diag) {
        diagnostics.push(reason.diag);
      } else {
        diagnostics.push({
          name: "unknown",
          ok: false,
          error: reason?.message || String(reason),
        });
      }
    }
  }

  // Return first successful result
  for (const result of settled) {
    if (result.status === "fulfilled") {
      return { html: result.value.html, diagnostics };
    }
  }

  return { html: null, diagnostics };
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const debug = req.nextUrl.searchParams.get("debug") === "1";

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
      const { html, diagnostics } = await fetchHtmlParallel(url);

      if (html) {
        if (debug) {
          return NextResponse.json({ ok: true, size: html.length, diagnostics });
        }
        return new NextResponse(html, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
          },
        });
      }

      return NextResponse.json(
        { error: "All proxy services failed", diagnostics },
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
