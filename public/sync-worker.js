/* sync-worker.js – Web Worker for background chapter sync */
/* DOMParser is NOT available in Workers — we use regex-based HTML parsing */

const REQUEST_DELAY = 500;

let cancelled = false;
let cfProxyUrl = ""; // Set from start message

// ── Helpers ──

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function validateHtmlText(text) {
  if (!text || text.length < 200) {
    throw new Error("Proxy returned empty/short response");
  }
  var head = text.slice(0, 500);
  if (!head.includes("<html") && !head.includes("<!DOCTYPE") && !head.includes("<!doctype")) {
    throw new Error("Proxy returned non-HTML (possible Cloudflare challenge)");
  }
  if (head.includes("<title>Just a moment") || head.includes("cf-challenge") || head.includes("<title>Attention Required")) {
    throw new Error("Proxy returned Cloudflare challenge page");
  }
}

async function fetchWithTimeout(url, timeoutMs) {
  var controller = new AbortController();
  var timer = setTimeout(function() { controller.abort(); }, timeoutMs || 12000);
  try {
    var resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return resp;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// Sources with Access-Control-Allow-Origin: * — fetch directly from browser
var CORS_OPEN_HOSTS = ["mangabuddy.com", "www.mangabuddy.com"];

function isCorsOpen(url) {
  try {
    return CORS_OPEN_HOSTS.indexOf(new URL(url).hostname) !== -1;
  } catch (e) {
    return false;
  }
}

async function fetchHtmlText(url, origin) {
  // Direct fetch for CORS-open sources (no server needed)
  if (isCorsOpen(url)) {
    var resp = await fetchWithTimeout(url, 12000);
    if (!resp.ok) throw new Error("Direct fetch failed: " + resp.status);
    var text = await resp.text();
    validateHtmlText(text);
    return text;
  }

  // Server proxy for CORS-restricted sources
  var endpoints = [];
  if (cfProxyUrl) {
    endpoints.push({ url: cfProxyUrl + "?url=" + encodeURIComponent(url), json: false });
  }
  endpoints.push({ url: origin + "/api/scrape?url=" + encodeURIComponent(url), json: false });
  endpoints.push({ url: origin + "/api/proxy?url=" + encodeURIComponent(url), json: false });

  var lastError = null;
  for (var i = 0; i < endpoints.length; i++) {
    try {
      var resp = await fetchWithTimeout(endpoints[i].url, 12000);
      if (!resp.ok) {
        lastError = new Error("Proxy returned " + resp.status);
        continue;
      }
      var text;
      if (endpoints[i].json) {
        var data = await resp.json();
        text = data.contents;
      } else {
        text = await resp.text();
      }
      validateHtmlText(text);
      return text;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("All proxies failed");
}

async function fetchJson(url) {
  var resp = await fetchWithTimeout(url, 15000);
  if (!resp.ok) throw new Error("API returned " + resp.status);
  return resp.json();
}

// ── Regex-based HTML parsing (no DOMParser in Workers) ──

function extractAllHrefs(html, pattern) {
  const results = [];
  const re = /href\s*=\s*["']([^"']*?)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1].includes(pattern)) {
      results.push(m[1]);
    }
  }
  return results;
}

function extractTitle(html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    return h1[1].replace(/<[^>]+>/g, "").trim();
  }
  const ct = html.match(/class\s*=\s*["']chapter-title["'][^>]*>([\s\S]*?)<\//i);
  if (ct) {
    return ct[1].replace(/<[^>]+>/g, "").trim();
  }
  return null;
}

// ── Manhwazone helpers ──

function extractChapterNumManhwazone(url) {
  const match = url.match(/chapter-(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function extractNextLink(html, currentNum) {
  const linkNext = html.match(/<link\s+[^>]*rel\s*=\s*["']next["'][^>]*href\s*=\s*["']([^"']+)["']/i)
    || html.match(/<link\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']next["']/i);
  if (linkNext) return linkNext[1];

  const aNext = html.match(/<a\s+[^>]*rel\s*=\s*["']next["'][^>]*href\s*=\s*["']([^"']+)["']/i)
    || html.match(/<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']next["']/i);
  if (aNext) return aNext[1];

  const nextNum = currentNum + 1;
  const hrefs = extractAllHrefs(html, "chapter-" + nextNum);
  if (hrefs.length > 0) return hrefs[0];

  const nextTextRe = /<a\s+[^>]*href\s*=\s*["']([^"']*chapter-[^"']+)["'][^>]*>\s*(?:next|next chapter|►|→)\s*<\/a>/gi;
  const ntm = nextTextRe.exec(html);
  if (ntm) return ntm[1];

  return null;
}

function extractImagesManhwazone(html) {
  const images = [];
  // New layout: <figure><img data-src="https://hot.planeptune.us/manga/..."></figure>
  const dataSrcRe = /<img\s+[^>]*?data-src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = dataSrcRe.exec(html)) !== null) {
    const src = m[1];
    if (!src || src.includes("1x1.webp") || src.includes("fallback") || src.includes("loading") || src.includes("pixel") || src.includes("data:image")) {
      continue;
    }
    if (src.includes("hot.planeptune.us") || src.includes("manhwatop.com") || src.includes("manhwazone.to/uploads")) {
      if (!images.includes(src)) images.push(src);
    }
  }

  // Fallback: regular src attributes
  if (images.length === 0) {
    const imgRe = /<img\s+[^>]*?src\s*=\s*["']([^"']+)["'][^>]*>/gi;
    while ((m = imgRe.exec(html)) !== null) {
      const src = m[1];
      if (!src || src.includes("1x1.webp") || src.includes("fallback") || src.includes("loading") || src.includes("pixel") || src.includes("data:image")) {
        continue;
      }
      if (src.includes("hot.planeptune.us") || src.includes("manhwatop.com") || src.includes("manhwazone.to/uploads")) {
        if (!images.includes(src)) images.push(src);
      }
    }
  }

  return images;
}

const SKIP_PATTERNS = [
  /logo/i, /banner/i, /icon/i, /avatar/i, /ads?[_-]/i, /sponsor/i,
  /badge/i, /button/i, /arrow/i, /social/i, /favicon/i, /thumb/i,
];

function isLikelyMangaImage(src) {
  return !SKIP_PATTERNS.some((p) => p.test(src));
}

// ── MangaKatana helpers ──

function extractChapterNumMangakatana(url) {
  const match = url.match(/\/c(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

function extractImagesMangakatana(html) {
  // Images stored in: var thzq=[url1, url2, ...]
  const match = html.match(/var\s+thzq\s*=\s*\[([^\]]+)\]/);
  if (match) {
    const urls = match[1].match(/['"]([^'"]+)['"]/g);
    if (urls) {
      return urls.map(function(u) { return u.replace(/['"]/g, ""); });
    }
  }
  return [];
}

// ══════════════════════════════════════════════════════════════
// Source-specific sync functions
// ══════════════════════════════════════════════════════════════

// ── Manhwazone Sync ──

async function discoverAllChaptersManhwazone(firstChapterUrl, origin) {
  const visited = new Set();
  let currentUrl = firstChapterUrl;
  let discoveredCount = 0;

  while (currentUrl && !cancelled) {
    if (visited.has(currentUrl)) break;
    visited.add(currentUrl);

    try {
      const html = await fetchHtmlText(currentUrl, origin);
      const num = extractChapterNumManhwazone(currentUrl);
      const title = extractTitle(html) || ("Chapter " + num);

      discoveredCount++;
      self.postMessage({
        type: "chapter_discovered",
        number: num,
        title: title,
        url: currentUrl,
        discoveredCount: discoveredCount,
      });

      const nextLink = extractNextLink(html, num);

      if (nextLink) {
        currentUrl = nextLink.startsWith("http") ? nextLink : "https://manhwazone.to" + nextLink;
      } else {
        currentUrl = null;
      }

      if (currentUrl) await delay(REQUEST_DELAY);
    } catch (e) {
      self.postMessage({ type: "error", error: "Discovery failed at " + currentUrl + ": " + (e.message || e) });
      return 0;
    }
  }

  return discoveredCount;
}

async function syncManhwazone(msg) {
  const { slug, seriesUrl, unsyncedChapters, alreadySyncedCount, totalKnown, origin, lastChapterUrl } = msg;

  let total = totalKnown;
  let completed = alreadySyncedCount;
  var chaptersToScrape = unsyncedChapters.slice();

  // Phase 1a: Full discovery (if no chapters known yet)
  if (totalKnown === 0 && seriesUrl) {
    const html = await fetchHtmlText(seriesUrl, origin);
    const chapterHrefs = extractAllHrefs(html, "/chapter-");
    const chapterUrls = [];
    for (const href of chapterHrefs) {
      const fullUrl = href.startsWith("http") ? href : "https://manhwazone.to" + href;
      chapterUrls.push(fullUrl);
    }

    const unique = [...new Set(chapterUrls)];
    unique.sort((a, b) => extractChapterNumManhwazone(a) - extractChapterNumManhwazone(b));
    if (unique.length > 0 && !cancelled) {
      const totalDiscovered = await discoverAllChaptersManhwazone(unique[0], origin);
      total = totalDiscovered;
      self.postMessage({ type: "discovery_done", totalDiscovered: totalDiscovered });
    } else {
      self.postMessage({ type: "done" });
    }

    if (cancelled) {
      self.postMessage({ type: "stopped" });
    }
    return;
  }

  // Phase 1b: Check for NEW chapters (follow "next" from last known chapter)
  if (lastChapterUrl && !cancelled) {
    self.postMessage({ type: "checking_new" });
    var currentUrl = lastChapterUrl;

    while (currentUrl && !cancelled) {
      try {
        var html = await fetchHtmlText(currentUrl, origin);
        var num = extractChapterNumManhwazone(currentUrl);
        var nextLink = extractNextLink(html, num);

        if (!nextLink) break;

        var nextUrl = nextLink.startsWith("http") ? nextLink : "https://manhwazone.to" + nextLink;
        var nextHtml = await fetchHtmlText(nextUrl, origin);
        var nextNum = extractChapterNumManhwazone(nextUrl);
        var nextTitle = extractTitle(nextHtml) || ("Chapter " + nextNum);
        var nextImages = extractImagesManhwazone(nextHtml);

        total++;

        if (nextImages.length > 0) {
          completed++;
          self.postMessage({
            type: "chapter_scraped",
            slug: slug,
            number: nextNum,
            title: nextTitle,
            url: nextUrl,
            imageUrls: nextImages,
            completed: completed,
            total: total,
          });
        } else {
          self.postMessage({
            type: "chapter_discovered",
            number: nextNum,
            title: nextTitle,
            url: nextUrl,
            discoveredCount: total,
          });
          chaptersToScrape.push({ number: nextNum, title: nextTitle, url: nextUrl });
        }

        currentUrl = nextUrl;
        if (!cancelled) await delay(REQUEST_DELAY);
      } catch (e) {
        break;
      }
    }
  }

  // Phase 2: Scrape images for all unsynced chapters
  for (let i = 0; i < chaptersToScrape.length; i++) {
    if (cancelled) break;

    const ch = chaptersToScrape[i];
    try {
      const html = await fetchHtmlText(ch.url, origin);
      const imageUrls = extractImagesManhwazone(html);
      completed++;

      self.postMessage({
        type: "chapter_scraped",
        slug: slug,
        number: ch.number,
        title: ch.title,
        url: ch.url,
        imageUrls: imageUrls,
        completed: completed,
        total: total,
      });
    } catch (err) {
      completed++;
    }

    if (i < chaptersToScrape.length - 1 && !cancelled) {
      await delay(1500);
    }
  }

  if (cancelled) {
    self.postMessage({ type: "stopped" });
  } else {
    self.postMessage({ type: "done" });
  }
}

// ── MangaDex Sync ──

async function syncMangadex(msg) {
  const { slug, sourceId, origin } = msg;
  const lang = msg.preferredLanguage || "en";
  const unsyncedChapters = msg.unsyncedChapters || [];
  let alreadySyncedCount = msg.alreadySyncedCount || 0;
  let totalKnown = msg.totalKnown || 0;

  try {
    // Phase 1: Discover chapters via API (if none known)
    if (totalKnown === 0 && sourceId) {
      self.postMessage({ type: "checking_new" });

      const chaptersData = await fetchJson(origin + "/api/mangadex/chapters?mangaId=" + sourceId + "&lang=" + encodeURIComponent(lang));
      const chapters = chaptersData.chapters || [];

      for (let i = 0; i < chapters.length; i++) {
        if (cancelled) break;
        const ch = chapters[i];
        const num = parseFloat(ch.chapter) || (i + 1);

        self.postMessage({
          type: "chapter_discovered",
          number: num,
          title: ch.title || ("Chapter " + num),
          url: "mangadex:" + ch.id,
          discoveredCount: i + 1,
        });
      }

      if (!cancelled) {
        self.postMessage({ type: "discovery_done", totalDiscovered: chapters.length });
      }
      return;
    }

    // Phase 1b: Check for new chapters
    if (sourceId && !cancelled) {
      self.postMessage({ type: "checking_new" });

      const chaptersData = await fetchJson(origin + "/api/mangadex/chapters?mangaId=" + sourceId + "&lang=" + encodeURIComponent(lang));
      const apiChapters = chaptersData.chapters || [];

      // Find chapters we don't have yet
      const knownUrls = new Set(unsyncedChapters.map(function(c) { return c.url; }));
      const newChapters = [];

      for (const ch of apiChapters) {
        const chUrl = "mangadex:" + ch.id;
        if (!knownUrls.has(chUrl)) {
          const num = parseFloat(ch.chapter) || 0;
          if (num > 0) {
            newChapters.push({
              number: num,
              title: ch.title || ("Chapter " + num),
              url: chUrl,
              chapterId: ch.id,
            });
          }
        }
      }

      // Report newly discovered chapters
      let total = totalKnown;
      for (const ch of newChapters) {
        if (cancelled) break;
        total++;
        self.postMessage({
          type: "chapter_discovered",
          number: ch.number,
          title: ch.title,
          url: ch.url,
          discoveredCount: total,
        });
      }
    }

    // Phase 2: Scrape images for unsynced chapters
    const chaptersToScrape = unsyncedChapters.slice();
    let completed = alreadySyncedCount;
    let total = totalKnown;

    for (let i = 0; i < chaptersToScrape.length; i++) {
      if (cancelled) break;

      const ch = chaptersToScrape[i];
      const chapterId = ch.url.replace("mangadex:", "");

      try {
        const imgData = await fetchJson(origin + "/api/mangadex/images?chapterId=" + chapterId);
        const imageUrls = imgData.imageUrls || [];
        completed++;

        self.postMessage({
          type: "chapter_scraped",
          slug: slug,
          number: ch.number,
          title: ch.title,
          url: ch.url,
          imageUrls: imageUrls,
          completed: completed,
          total: total,
        });
      } catch (err) {
        completed++;
      }

      if (i < chaptersToScrape.length - 1 && !cancelled) {
        await delay(300); // MangaDex rate limit
      }
    }

    if (cancelled) {
      self.postMessage({ type: "stopped" });
    } else {
      self.postMessage({ type: "done" });
    }
  } catch (err) {
    self.postMessage({ type: "error", error: (err && err.message) || String(err) });
  }
}

// ── MangaKatana Sync ──

async function syncMangakatana(msg) {
  const { slug, seriesUrl, origin } = msg;
  const unsyncedChapters = msg.unsyncedChapters || [];
  let alreadySyncedCount = msg.alreadySyncedCount || 0;
  let totalKnown = msg.totalKnown || 0;

  try {
    let total = totalKnown;
    let completed = alreadySyncedCount;
    var chaptersToScrape = unsyncedChapters.slice();

    // Phase 1: Discover chapters from series page
    if (totalKnown === 0 && seriesUrl) {
      self.postMessage({ type: "checking_new" });
      const html = await fetchHtmlText(seriesUrl, origin);

      // Extract chapter links matching /c{num}
      const re = /href\s*=\s*["']([^"']*\/c\d[^"']*)["']/gi;
      let m;
      const chapterUrls = [];
      while ((m = re.exec(html)) !== null) {
        const href = m[1];
        const fullUrl = href.startsWith("http") ? href : "https://mangakatana.com" + href;
        chapterUrls.push(fullUrl);
      }

      const unique = [...new Set(chapterUrls)];
      unique.sort(function(a, b) { return extractChapterNumMangakatana(a) - extractChapterNumMangakatana(b); });

      for (let i = 0; i < unique.length; i++) {
        if (cancelled) break;
        const url = unique[i];
        const num = extractChapterNumMangakatana(url);

        self.postMessage({
          type: "chapter_discovered",
          number: num,
          title: "Chapter " + num,
          url: url,
          discoveredCount: i + 1,
        });
      }

      if (!cancelled) {
        self.postMessage({ type: "discovery_done", totalDiscovered: unique.length });
      }
      return;
    }

    // Phase 1b: Check for new chapters
    if (seriesUrl && !cancelled) {
      self.postMessage({ type: "checking_new" });
      const html = await fetchHtmlText(seriesUrl, origin);

      const re = /href\s*=\s*["']([^"']*\/c\d[^"']*)["']/gi;
      let m;
      const currentUrls = new Set(unsyncedChapters.map(function(c) { return c.url; }));

      while ((m = re.exec(html)) !== null) {
        if (cancelled) break;
        const href = m[1];
        const fullUrl = href.startsWith("http") ? href : "https://mangakatana.com" + href;
        if (!currentUrls.has(fullUrl)) {
          const num = extractChapterNumMangakatana(fullUrl);
          if (num > 0) {
            total++;
            self.postMessage({
              type: "chapter_discovered",
              number: num,
              title: "Chapter " + num,
              url: fullUrl,
              discoveredCount: total,
            });
          }
        }
      }
    }

    // Phase 2: Scrape images
    for (let i = 0; i < chaptersToScrape.length; i++) {
      if (cancelled) break;

      const ch = chaptersToScrape[i];
      try {
        const html = await fetchHtmlText(ch.url, origin);
        const imageUrls = extractImagesMangakatana(html);
        completed++;

        self.postMessage({
          type: "chapter_scraped",
          slug: slug,
          number: ch.number,
          title: ch.title,
          url: ch.url,
          imageUrls: imageUrls,
          completed: completed,
          total: total,
        });
      } catch (err) {
        completed++;
      }

      if (i < chaptersToScrape.length - 1 && !cancelled) {
        await delay(1000);
      }
    }

    if (cancelled) {
      self.postMessage({ type: "stopped" });
    } else {
      self.postMessage({ type: "done" });
    }
  } catch (err) {
    self.postMessage({ type: "error", error: (err && err.message) || String(err) });
  }
}

// ── WeebCentral Sync ──

async function syncWeebCentral(msg) {
  const { slug, sourceId, origin } = msg;
  const unsyncedChapters = msg.unsyncedChapters || [];
  let alreadySyncedCount = msg.alreadySyncedCount || 0;
  let totalKnown = msg.totalKnown || 0;

  try {
    let total = totalKnown;
    let completed = alreadySyncedCount;
    var chaptersToScrape = unsyncedChapters.slice();

    // Phase 1: Discover chapters from series page
    if (totalKnown === 0 && msg.seriesUrl) {
      self.postMessage({ type: "checking_new" });
      const html = await fetchHtmlText(msg.seriesUrl, origin);

      // Extract chapter links: href="https://weebcentral.com/chapters/{ULID}"
      const re = /href\s*=\s*["'](https:\/\/weebcentral\.com\/chapters\/[A-Z0-9]+)["']/gi;
      let m;
      const chapterUrls = [];
      while ((m = re.exec(html)) !== null) {
        chapterUrls.push(m[1]);
      }

      const unique = [...new Set(chapterUrls)];
      // Reverse so chapter 1 comes first (they appear latest-first on the page)
      unique.reverse();

      for (let i = 0; i < unique.length; i++) {
        if (cancelled) break;
        const url = unique[i];
        const num = i + 1;

        self.postMessage({
          type: "chapter_discovered",
          number: num,
          title: "Chapter " + num,
          url: "weebcentral:" + url.split("/chapters/")[1],
          discoveredCount: i + 1,
        });
      }

      if (!cancelled) {
        self.postMessage({ type: "discovery_done", totalDiscovered: unique.length });
      }
      return;
    }

    // Phase 1b: Check for new chapters
    if (msg.seriesUrl && !cancelled) {
      self.postMessage({ type: "checking_new" });
      const html = await fetchHtmlText(msg.seriesUrl, origin);

      const re = /href\s*=\s*["'](https:\/\/weebcentral\.com\/chapters\/[A-Z0-9]+)["']/gi;
      let m;
      const currentUrls = new Set(unsyncedChapters.map(function(c) { return c.url; }));

      while ((m = re.exec(html)) !== null) {
        if (cancelled) break;
        const chId = m[1].split("/chapters/")[1];
        const chUrl = "weebcentral:" + chId;
        if (!currentUrls.has(chUrl)) {
          total++;
          self.postMessage({
            type: "chapter_discovered",
            number: total,
            title: "Chapter " + total,
            url: chUrl,
            discoveredCount: total,
          });
        }
      }
    }

    // Phase 2: Scrape images
    for (let i = 0; i < chaptersToScrape.length; i++) {
      if (cancelled) break;

      const ch = chaptersToScrape[i];
      const chId = ch.url.replace("weebcentral:", "");

      try {
        const imgUrl = "https://weebcentral.com/chapters/" + chId + "/images?is_prev=False&current_page=1&reading_style=long_strip";
        const html = await fetchHtmlText(imgUrl, origin);

        const imageUrls = [];
        const imgRe = /src="(https:\/\/hot\.planeptune\.us\/[^"]+)"/gi;
        let im;
        while ((im = imgRe.exec(html)) !== null) {
          if (!imageUrls.includes(im[1])) imageUrls.push(im[1]);
        }

        completed++;
        self.postMessage({
          type: "chapter_scraped",
          slug: slug,
          number: ch.number,
          title: ch.title,
          url: ch.url,
          imageUrls: imageUrls,
          completed: completed,
          total: total,
        });
      } catch (err) {
        completed++;
      }

      if (i < chaptersToScrape.length - 1 && !cancelled) {
        await delay(1000);
      }
    }

    if (cancelled) {
      self.postMessage({ type: "stopped" });
    } else {
      self.postMessage({ type: "done" });
    }
  } catch (err) {
    self.postMessage({ type: "error", error: (err && err.message) || String(err) });
  }
}

// ── Atsumaru Sync ──

async function syncAtsumaru(msg) {
  const { slug, sourceId, origin } = msg;
  const unsyncedChapters = msg.unsyncedChapters || [];
  let alreadySyncedCount = msg.alreadySyncedCount || 0;
  let totalKnown = msg.totalKnown || 0;

  try {
    let total = totalKnown;
    let completed = alreadySyncedCount;
    var chaptersToScrape = unsyncedChapters.slice();

    // Phase 1: Discover chapters via API
    if (totalKnown === 0 && sourceId) {
      self.postMessage({ type: "checking_new" });

      const chaptersData = await fetchJson("https://atsu.moe/api/manga/allChapters?mangaId=" + sourceId);
      const chapters = chaptersData.chapters || [];

      // Chapters come in reverse order (latest first), reverse for ascending
      const sorted = chapters.slice().reverse();

      for (let i = 0; i < sorted.length; i++) {
        if (cancelled) break;
        const ch = sorted[i];
        const num = ch.number || (i + 1);

        self.postMessage({
          type: "chapter_discovered",
          number: num,
          title: ch.title || ("Chapter " + num),
          url: "atsumaru:" + sourceId + ":" + ch.id,
          discoveredCount: i + 1,
        });
      }

      if (!cancelled) {
        self.postMessage({ type: "discovery_done", totalDiscovered: sorted.length });
      }
      return;
    }

    // Phase 1b: Check for new chapters
    if (sourceId && !cancelled) {
      self.postMessage({ type: "checking_new" });

      const chaptersData = await fetchJson("https://atsu.moe/api/manga/allChapters?mangaId=" + sourceId);
      const apiChapters = chaptersData.chapters || [];

      const knownUrls = new Set(unsyncedChapters.map(function(c) { return c.url; }));

      for (const ch of apiChapters) {
        if (cancelled) break;
        const chUrl = "atsumaru:" + sourceId + ":" + ch.id;
        if (!knownUrls.has(chUrl)) {
          const num = ch.number || 0;
          if (num > 0) {
            total++;
            self.postMessage({
              type: "chapter_discovered",
              number: num,
              title: ch.title || ("Chapter " + num),
              url: chUrl,
              discoveredCount: total,
            });
          }
        }
      }
    }

    // Phase 2: Scrape images
    for (let i = 0; i < chaptersToScrape.length; i++) {
      if (cancelled) break;

      const ch = chaptersToScrape[i];
      // URL format: atsumaru:{mangaId}:{chapterId}
      const parts = ch.url.replace("atsumaru:", "").split(":");
      const mangaId = parts[0];
      const chapterId = parts[1];

      try {
        const data = await fetchJson("https://atsu.moe/api/read/chapter?mangaId=" + mangaId + "&chapterId=" + chapterId);
        const pages = (data.readChapter && data.readChapter.pages) || [];
        const imageUrls = pages.map(function(p) {
          var img = p.image;
          return img.startsWith("/") ? "https://atsu.moe" + img : img;
        });

        completed++;
        self.postMessage({
          type: "chapter_scraped",
          slug: slug,
          number: ch.number,
          title: ch.title,
          url: ch.url,
          imageUrls: imageUrls,
          completed: completed,
          total: total,
        });
      } catch (err) {
        completed++;
      }

      if (i < chaptersToScrape.length - 1 && !cancelled) {
        await delay(300);
      }
    }

    if (cancelled) {
      self.postMessage({ type: "stopped" });
    } else {
      self.postMessage({ type: "done" });
    }
  } catch (err) {
    self.postMessage({ type: "error", error: (err && err.message) || String(err) });
  }
}

// ── MangaBuddy Sync ──

async function syncMangaBuddy(msg) {
  const { slug, seriesUrl, origin } = msg;
  const unsyncedChapters = msg.unsyncedChapters || [];
  let alreadySyncedCount = msg.alreadySyncedCount || 0;
  let totalKnown = msg.totalKnown || 0;

  try {
    let total = totalKnown;
    let completed = alreadySyncedCount;
    var chaptersToScrape = unsyncedChapters.slice();

    // Phase 1: Discover chapters from series page
    if (totalKnown === 0 && seriesUrl) {
      self.postMessage({ type: "checking_new" });

      // MangaBuddy loads chapters via /api/manga/{bookId}/chapters
      const html = await fetchHtmlText(seriesUrl, origin);

      // Extract chapter links: href="/{slug}/chapter-{num}-{title}"
      const bookSlug = seriesUrl.replace("https://mangabuddy.com/", "").split("/")[0];
      const re = new RegExp('href="/' + bookSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '/([^"]*chapter[^"]*)"', 'gi');
      let m;
      const chapterUrls = [];
      while ((m = re.exec(html)) !== null) {
        chapterUrls.push("https://mangabuddy.com/" + bookSlug + "/" + m[1]);
      }

      const unique = [...new Set(chapterUrls)];
      // Sort by chapter number
      unique.sort(function(a, b) {
        return extractChapterNumMangaBuddy(a) - extractChapterNumMangaBuddy(b);
      });

      for (let i = 0; i < unique.length; i++) {
        if (cancelled) break;
        const url = unique[i];
        const num = extractChapterNumMangaBuddy(url);

        self.postMessage({
          type: "chapter_discovered",
          number: num,
          title: "Chapter " + num,
          url: url,
          discoveredCount: i + 1,
        });
      }

      if (!cancelled) {
        self.postMessage({ type: "discovery_done", totalDiscovered: unique.length });
      }
      return;
    }

    // Phase 1b: Check for new chapters
    if (seriesUrl && !cancelled) {
      self.postMessage({ type: "checking_new" });
      const html = await fetchHtmlText(seriesUrl, origin);

      const bookSlug = seriesUrl.replace("https://mangabuddy.com/", "").split("/")[0];
      const re = new RegExp('href="/' + bookSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '/([^"]*chapter[^"]*)"', 'gi');
      let m;
      const currentUrls = new Set(unsyncedChapters.map(function(c) { return c.url; }));

      while ((m = re.exec(html)) !== null) {
        if (cancelled) break;
        const fullUrl = "https://mangabuddy.com/" + bookSlug + "/" + m[1];
        if (!currentUrls.has(fullUrl)) {
          const num = extractChapterNumMangaBuddy(fullUrl);
          if (num > 0) {
            total++;
            self.postMessage({
              type: "chapter_discovered",
              number: num,
              title: "Chapter " + num,
              url: fullUrl,
              discoveredCount: total,
            });
          }
        }
      }
    }

    // Phase 2: Scrape images
    for (let i = 0; i < chaptersToScrape.length; i++) {
      if (cancelled) break;

      const ch = chaptersToScrape[i];
      try {
        const html = await fetchHtmlText(ch.url, origin);
        const imageUrls = extractImagesMangaBuddy(html);
        completed++;

        self.postMessage({
          type: "chapter_scraped",
          slug: slug,
          number: ch.number,
          title: ch.title,
          url: ch.url,
          imageUrls: imageUrls,
          completed: completed,
          total: total,
        });
      } catch (err) {
        completed++;
      }

      if (i < chaptersToScrape.length - 1 && !cancelled) {
        await delay(1500);
      }
    }

    if (cancelled) {
      self.postMessage({ type: "stopped" });
    } else {
      self.postMessage({ type: "done" });
    }
  } catch (err) {
    self.postMessage({ type: "error", error: (err && err.message) || String(err) });
  }
}

function extractChapterNumMangaBuddy(url) {
  const match = url.match(/chapter-(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

function extractImagesMangaBuddy(html) {
  // var chapImages = 'url1,url2,...'
  const match = html.match(/var\s+chapImages\s*=\s*'([^']+)'/);
  if (match) {
    return match[1].split(",").filter(function(u) { return u.startsWith("http"); });
  }
  return [];
}

// ── Main message handler ──

self.onmessage = async function (e) {
  const msg = e.data;

  if (msg.type === "stop") {
    cancelled = true;
    return;
  }

  if (msg.type === "start") {
    cancelled = false;
    cfProxyUrl = msg.cfProxyUrl || "";

    const source = msg.source || "manhwazone";

    try {
      switch (source) {
        case "mangadex":
          await syncMangadex(msg);
          break;
        case "mangakatana":
          await syncMangakatana(msg);
          break;
        case "weebcentral":
          await syncWeebCentral(msg);
          break;
        case "atsumaru":
          await syncAtsumaru(msg);
          break;
        case "mangabuddy":
          await syncMangaBuddy(msg);
          break;
        default:
          await syncManhwazone(msg);
          break;
      }
    } catch (err) {
      self.postMessage({ type: "error", error: (err && err.message) || String(err) });
    }
  }
};
