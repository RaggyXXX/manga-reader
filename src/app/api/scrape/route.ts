import { NextRequest, NextResponse } from "next/server";

// Node.js runtime (not edge) — uses got + http2-wrapper for TLS fingerprint bypass

const ALLOWED_HOSTS = [
  "manhwazone.to",
  "www.manhwazone.to",
  "c2.manhwatop.com",
  "c4.manhwatop.com",
  "media.manhwazone.to",
  "official.lowee.us",
];

// Chrome-like cipher suite order — key to bypassing Cloudflare TLS fingerprinting
const CHROME_CIPHERS = [
  "TLS_AES_128_GCM_SHA256",
  "TLS_AES_256_GCM_SHA384",
  "TLS_CHACHA20_POLY1305_SHA256",
  "ECDHE-ECDSA-AES128-GCM-SHA256",
  "ECDHE-RSA-AES128-GCM-SHA256",
  "ECDHE-ECDSA-AES256-GCM-SHA384",
  "ECDHE-RSA-AES256-GCM-SHA384",
].join(":");

async function fetchWithH2(url: string, isImage: boolean): Promise<{ body: string; contentType: string }> {
  const gotModule = await import("got");
  const h2Module = await import("http2-wrapper");
  const got = gotModule.default;
  const h2auto = h2Module.default.auto;

  const instance = got.extend({
    // @ts-expect-error http2-wrapper type mismatch with got's RequestFunction
    request: h2auto,
    https: { ciphers: CHROME_CIPHERS },
    timeout: { request: 8000 },
    retry: { limit: 0 },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resp: any = await instance(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: isImage
        ? "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8"
        : "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      Referer: isImage ? "https://manhwazone.to/" : "",
      "Sec-CH-UA": '"Chromium";v="131", "Not_A Brand";v="24"',
      "Sec-CH-UA-Mobile": "?0",
      "Sec-CH-UA-Platform": '"Windows"',
      "Sec-Fetch-Dest": isImage ? "image" : "document",
      "Sec-Fetch-Mode": isImage ? "no-cors" : "navigate",
      "Sec-Fetch-Site": isImage ? "cross-site" : "none",
      ...(isImage ? {} : { "Sec-Fetch-User": "?1", "Upgrade-Insecure-Requests": "1" }),
    },
  });

  return {
    body: resp.body,
    contentType: resp.headers["content-type"] || (isImage ? "image/jpeg" : "text/html"),
  };
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
