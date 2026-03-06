// Shared TLS bypass helper — used by /api/scrape and /api/search
// Uses got + http2-wrapper with Chrome-like TLS cipher suite order

export const CHROME_CIPHERS = [
  "TLS_AES_128_GCM_SHA256",
  "TLS_AES_256_GCM_SHA384",
  "TLS_CHACHA20_POLY1305_SHA256",
  "ECDHE-ECDSA-AES128-GCM-SHA256",
  "ECDHE-RSA-AES128-GCM-SHA256",
  "ECDHE-ECDSA-AES256-GCM-SHA384",
  "ECDHE-RSA-AES256-GCM-SHA384",
].join(":");

export function getRefererForHost(hostname: string): string {
  if (hostname.includes("manhwatop.com") || hostname.includes("manhwazone.to") || hostname.includes("planeptune.us")) return "https://manhwazone.to/";
  if (hostname.includes("mangakatana.com")) return "https://mangakatana.com/";
  if (hostname.includes("weebcentral.com") || hostname.includes("compsci88.com")) return "https://weebcentral.com/";
  if (hostname.includes("mangabuddy.com") || hostname.includes("mbbcdn")) return "https://mangabuddy.com/";
  return "";
}

export async function fetchWithH2(url: string, isImage: boolean): Promise<{ body: string; contentType: string }> {
  const gotModule = await import("got");
  const h2Module = await import("http2-wrapper");
  const got = gotModule.default;
  const h2auto = h2Module.default.auto;

  const hostname = new URL(url).hostname;
  const referer = isImage ? getRefererForHost(hostname) : "";

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
      Referer: referer,
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
