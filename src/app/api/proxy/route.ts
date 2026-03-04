import { NextRequest, NextResponse } from "next/server";

// Edge runtime: 30s timeout on Netlify (vs 10s for regular functions)
export const runtime = "edge";

const ALLOWED_HOSTS = ["manhwazone.to", "www.manhwazone.to", "c2.manhwatop.com", "c4.manhwatop.com", "media.manhwazone.to", "official.lowee.us"];

const FETCH_TIMEOUT = 8000;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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

function looksLikeHtml(html: string): boolean {
  const head = html.slice(0, 500);
  return head.includes("<html") || head.includes("<!DOCTYPE") || head.includes("<!doctype") || head.includes("<HTML");
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

function isValidHtml(html: string | null | undefined): html is string {
  return !!html && html.length > 200 && looksLikeHtml(html) && !isErrorPage(html);
}

interface DiagEntry {
  attempt: number;
  service: string;
  ok: boolean;
  error?: string;
  size?: number;
  ms?: number;
}

/** Try allorigins /get endpoint (JSON wrapper) */
async function tryAlloriginsGet(url: string, mirror: string): Promise<string> {
  const resp = await fetchWithTimeout(`${mirror}/get?url=${encodeURIComponent(url)}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  const html: string | undefined = json.contents;
  const len = html?.length || 0;
  if (!isValidHtml(html)) throw new Error(`invalid HTML (${len}b)`);
  return html;
}

/** Try allorigins /raw endpoint */
async function tryAlloriginsRaw(url: string, mirror: string): Promise<string> {
  const resp = await fetchWithTimeout(`${mirror}/raw?url=${encodeURIComponent(url)}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const html = await resp.text();
  const rawLen = html?.length || 0;
  if (!isValidHtml(html)) throw new Error(`invalid HTML (${rawLen}b)`);
  return html;
}

/** Try direct fetch with browser headers */
async function tryDirect(url: string): Promise<string> {
  const resp = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
    },
    redirect: "follow",
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const ct = resp.headers.get("content-type") || "";
  if (!ct.includes("text/html")) throw new Error(`not HTML: ${ct}`);
  const html = await resp.text();
  const directLen = html?.length || 0;
  if (!isValidHtml(html)) throw new Error(`invalid HTML (${directLen}b)`);
  return html;
}

const ALLORIGINS_MIRRORS = [
  "https://api.allorigins.win",
  "https://api.allorigins.hexlet.app",
];

/**
 * Fetch HTML with retry logic.
 * Strategy: Try allorigins mirrors + direct in parallel, retry up to 3 times with 2s delay.
 * Edge runtime gives us 30s total budget.
 */
async function fetchHtmlWithRetry(url: string): Promise<{ html: string | null; diagnostics: DiagEntry[] }> {
  const diagnostics: DiagEntry[] = [];
  const MAX_ATTEMPTS = 2;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await delay(2000);

    // Race all services in parallel for this attempt
    const services: { name: string; fn: () => Promise<string> }[] = [];
    for (const mirror of ALLORIGINS_MIRRORS) {
      const name = mirror.includes("hexlet") ? "hexlet" : "allorigins";
      services.push({ name: `${name}/get`, fn: () => tryAlloriginsGet(url, mirror) });
      services.push({ name: `${name}/raw`, fn: () => tryAlloriginsRaw(url, mirror) });
    }
    services.push({ name: "direct", fn: () => tryDirect(url) });

    const start = Date.now();
    const settled = await Promise.allSettled(services.map((s) => s.fn()));

    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      const name = services[i].name;
      const ms = Date.now() - start;
      if (r.status === "fulfilled") {
        diagnostics.push({ attempt, service: name, ok: true, size: r.value.length, ms });
      } else {
        diagnostics.push({ attempt, service: name, ok: false, error: r.reason?.message || String(r.reason), ms });
      }
    }

    // Return first success
    for (const r of settled) {
      if (r.status === "fulfilled") {
        return { html: r.value, diagnostics };
      }
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
    if (!isImage) {
      const { html, diagnostics } = await fetchHtmlWithRetry(url);

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
        { error: "All proxy services failed after retries", diagnostics },
        { status: 502 }
      );
    }

    // Direct fetch for images
    const resp = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://manhwazone.to/",
      },
    });

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
