const SW_VERSION = "dev";
const CACHE_NAME = "manga-blast-v1";
const IMG_CACHE = "manga-images-v2";
const API_CACHE = "manga-api-v2";
const FONT_CACHE = "manga-fonts-v1";
const COVER_CACHE = "manga-covers-v1";
const MAX_IMG_CACHE = 2000;
const MAX_COVER_CACHE = 200;

self.addEventListener("install", () => {
  // Do NOT skipWaiting here — let the client decide when to activate
});

self.addEventListener("activate", (event) => {
  const keepCaches = [CACHE_NAME, IMG_CACHE, API_CACHE, FONT_CACHE, COVER_CACHE];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !keepCaches.includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Listen for skip-waiting message from the client
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data === "GET_VERSION") {
    event.source.postMessage({ type: "SW_VERSION", version: SW_VERSION });
  }
});

// LRU eviction for image cache
async function evictOldImages() {
  const cache = await caches.open(IMG_CACHE);
  const keys = await cache.keys();
  if (keys.length > MAX_IMG_CACHE) {
    const toDelete = keys.slice(0, keys.length - MAX_IMG_CACHE);
    await Promise.all(toDelete.map((req) => cache.delete(req)));
  }
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Google Fonts: cache-first (immutable font files)
  if (
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com"
  ) {
    event.respondWith(
      caches.open(FONT_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          });
        })
      )
    );
    return;
  }

  // Cover images: cache-first (detect by /covers/ in MangaDex proxy or cover-like URLs)
  if (url.pathname === "/api/mangadex/img" || (url.pathname === "/api/proxy" && url.searchParams.get("url")?.includes("/covers/"))) {
    const targetUrl = url.searchParams.get("url") || "";
    if (targetUrl.includes("/covers/") || url.pathname === "/api/mangadex/img") {
      event.respondWith(
        caches.open(COVER_CACHE).then((cache) =>
          cache.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((response) => {
              if (response.ok) {
                cache.put(event.request, response.clone());
                // Evict old covers
                cache.keys().then((keys) => {
                  if (keys.length > MAX_COVER_CACHE) {
                    const toDelete = keys.slice(0, keys.length - MAX_COVER_CACHE);
                    toDelete.forEach((req) => cache.delete(req));
                  }
                });
              }
              return response;
            });
          })
        )
      );
      return;
    }
  }

  // Image proxy: cache-first with LRU eviction
  if (url.pathname === "/api/proxy" && url.searchParams.get("url")) {
    const targetUrl = url.searchParams.get("url") || "";
    // Only cache image responses, not HTML pages
    const isImageRequest = targetUrl.includes("manhwatop.com") || targetUrl.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i);
    if (isImageRequest) {
      event.respondWith(
        caches.open(IMG_CACHE).then((cache) =>
          cache.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((response) => {
              if (response.ok) {
                cache.put(event.request, response.clone());
                evictOldImages();
              }
              return response;
            });
          })
        )
      );
      return;
    }
  }

  // API routes: network-first with cache fallback
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok && event.request.method === "GET") {
            const clone = response.clone();
            caches.open(API_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((r) => r || new Response("Offline", { status: 503 })))
    );
    return;
  }

  // Navigation: network-first
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request).then((r) => r || new Response("Offline", { status: 503 }))
      )
    );
  }
});
