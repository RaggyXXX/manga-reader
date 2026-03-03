/* sync-worker.js – Web Worker for background chapter sync */
/* DOMParser is NOT available in Workers — we use regex-based HTML parsing */

const REQUEST_DELAY = 500;

let cancelled = false;

// ── Helpers ──

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchHtmlText(url, origin) {
  // All HTML fetching goes through our proxy (which uses allorigins server-side)
  const proxyBase = origin + "/api/proxy?url=";
  const resp = await fetch(proxyBase + encodeURIComponent(url));
  if (!resp.ok) {
    throw new Error("Proxy returned " + resp.status);
  }
  const text = await resp.text();
  if (!text || text.length < 200) {
    throw new Error("Proxy returned empty/short response");
  }
  return text;
}

function extractChapterNum(url) {
  const match = url.match(/chapter-(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

// ── Regex-based HTML parsing (no DOMParser in Workers) ──

function extractAllHrefs(html, pattern) {
  // Find all href attributes containing the pattern
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
  // Try <h1>...</h1>
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    return h1[1].replace(/<[^>]+>/g, "").trim();
  }
  // Try .chapter-title
  const ct = html.match(/class\s*=\s*["']chapter-title["'][^>]*>([\s\S]*?)<\//i);
  if (ct) {
    return ct[1].replace(/<[^>]+>/g, "").trim();
  }
  return null;
}

function extractNextLink(html, currentNum) {
  // Try <link rel="next" href="...">
  const linkNext = html.match(/<link\s+[^>]*rel\s*=\s*["']next["'][^>]*href\s*=\s*["']([^"']+)["']/i)
    || html.match(/<link\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']next["']/i);
  if (linkNext) return linkNext[1];

  // Try <a rel="next" href="...">
  const aNext = html.match(/<a\s+[^>]*rel\s*=\s*["']next["'][^>]*href\s*=\s*["']([^"']+)["']/i)
    || html.match(/<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']next["']/i);
  if (aNext) return aNext[1];

  // Try chapter-{nextNum} link
  const nextNum = currentNum + 1;
  const hrefs = extractAllHrefs(html, "chapter-" + nextNum);
  if (hrefs.length > 0) return hrefs[0];

  // Try "next" text links
  const nextTextRe = /<a\s+[^>]*href\s*=\s*["']([^"']*chapter-[^"']+)["'][^>]*>\s*(?:next|next chapter|►|→)\s*<\/a>/gi;
  const ntm = nextTextRe.exec(html);
  if (ntm) return ntm[1];

  return null;
}

function extractImages(html) {
  // Find the reading content section or fall back to full page
  let section = html;
  const readingContent = html.match(/class\s*=\s*["']reading-content["']([\s\S]*?)(?=<\/div>\s*<(?:div|footer|section|aside)\s|$)/i);
  if (readingContent) {
    section = readingContent[0] + readingContent[1];
  }
  const chapterSection = html.match(/aria-label\s*=\s*["']Chapter pages["']([\s\S]*?)(?=<\/section>)/i);
  if (chapterSection) {
    section = chapterSection[0] + chapterSection[1];
  }

  const images = [];
  const imgRe = /<img\s+[^>]*?(?:data-src|data-lazy-src|src)\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = imgRe.exec(section)) !== null) {
    const src = m[1];
    if (!src || src.includes("1x1.webp") || src.includes("fallback") || src.includes("loading") || src.includes("pixel") || src.includes("data:image")) {
      continue;
    }
    if (src.includes("manhwatop.com") || src.includes("manhwazone.to/uploads") || isLikelyMangaImage(src)) {
      images.push(src);
    }
  }

  // Also try to get data-src separately (the above regex only gets the first matching attribute)
  const dataSrcRe = /<img\s+[^>]*?data-src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((m = dataSrcRe.exec(section)) !== null) {
    const src = m[1];
    if (images.includes(src)) continue;
    if (!src || src.includes("1x1.webp") || src.includes("fallback") || src.includes("loading") || src.includes("pixel") || src.includes("data:image")) {
      continue;
    }
    if (src.includes("manhwatop.com") || src.includes("manhwazone.to/uploads") || isLikelyMangaImage(src)) {
      images.push(src);
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

// ── Discovery ──

async function discoverAllChapters(firstChapterUrl, origin) {
  const visited = new Set();
  let currentUrl = firstChapterUrl;
  let discoveredCount = 0;

  while (currentUrl && !cancelled) {
    if (visited.has(currentUrl)) break;
    visited.add(currentUrl);

    try {
      const html = await fetchHtmlText(currentUrl, origin);
      const num = extractChapterNum(currentUrl);
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

// ── Main message handler ──

self.onmessage = async function (e) {
  const msg = e.data;

  if (msg.type === "stop") {
    cancelled = true;
    return;
  }

  if (msg.type === "start") {
    cancelled = false;
    const { slug, seriesUrl, unsyncedChapters, alreadySyncedCount, totalKnown, origin } = msg;

    try {
      let total = totalKnown;
      let completed = alreadySyncedCount;

      // Phase 1: Discovery (if no chapters known yet)
      if (totalKnown === 0 && seriesUrl) {
        const html = await fetchHtmlText(seriesUrl, origin);
        const chapterHrefs = extractAllHrefs(html, "/chapter-");
        const chapterUrls = [];
        for (const href of chapterHrefs) {
          const fullUrl = href.startsWith("http") ? href : "https://manhwazone.to" + href;
          chapterUrls.push(fullUrl);
        }

        const unique = [...new Set(chapterUrls)];
        unique.sort((a, b) => extractChapterNum(a) - extractChapterNum(b));
        if (unique.length > 0 && !cancelled) {
          const totalDiscovered = await discoverAllChapters(unique[0], origin);
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

      // Phase 2: Scrape images for unsynced chapters
      for (let i = 0; i < unsyncedChapters.length; i++) {
        if (cancelled) break;

        const ch = unsyncedChapters[i];
        try {
          const html = await fetchHtmlText(ch.url, origin);
          const imageUrls = extractImages(html);
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

        if (i < unsyncedChapters.length - 1 && !cancelled) {
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
};
