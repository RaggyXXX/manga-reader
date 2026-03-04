/**
 * Lightweight background Web Worker that checks each series for new chapters.
 * Input:  { type: "check", series: [...], origin }
 * Output: { type: "result", slug, newCount } per series
 *         { type: "done" }
 */

self.onmessage = async function (e) {
  const msg = e.data;
  if (msg.type !== "check") return;

  const { series, origin } = msg;

  for (const s of series) {
    try {
      const remoteCount = await countRemoteChapters(s, origin);
      const newCount = Math.max(0, remoteCount - s.totalChapters);
      self.postMessage({ type: "result", slug: s.slug, newCount });
    } catch {
      self.postMessage({ type: "result", slug: s.slug, newCount: 0 });
    }
    // Stagger requests: 1.5s delay between series
    await delay(1500);
  }

  self.postMessage({ type: "done" });
};

async function countRemoteChapters(s, origin) {
  const source = s.source || "manhwazone";

  if (source === "mangadex") {
    return countMangaDexChapters(s, origin);
  }
  return countScrapedChapters(s.sourceUrl, source, origin);
}

async function countMangaDexChapters(s, origin) {
  if (!s.sourceId) return 0;
  const lang = s.preferredLanguage || "en";
  const res = await fetch(
    `${origin}/api/mangadex/chapters?mangaId=${s.sourceId}&lang=${lang}`
  );
  if (!res.ok) return 0;
  const data = await res.json();
  return Array.isArray(data.chapters) ? data.chapters.length : 0;
}

async function countScrapedChapters(sourceUrl, source, origin) {
  const res = await fetch(
    `${origin}/api/scrape?url=${encodeURIComponent(sourceUrl)}`
  );
  if (!res.ok) return 0;
  const html = await res.text();

  switch (source) {
    case "mangakatana":
      return countUniqueMatches(html, /\/c\d+/g);
    case "vymanga":
      return countUniqueMatches(html, /chapter-\d+/g);
    case "manhwazone":
    default:
      return countManhwazoneChapters(html);
  }
}

function countManhwazoneChapters(html) {
  const matches = html.match(/href="[^"]*\/chapter-\d+[^"]*"/g);
  if (!matches) return 0;
  const unique = new Set(
    matches
      .map((m) => {
        const match = m.match(/chapter-(\d+)/);
        return match ? match[1] : null;
      })
      .filter(Boolean)
  );
  return unique.size;
}

function countUniqueMatches(html, pattern) {
  const matches = html.match(pattern);
  if (!matches) return 0;
  return new Set(matches).size;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
