/**
 * Lightweight background Web Worker that checks each series for new chapters.
 * Input:  { type: "check", series: [...], origin, nativeMode }
 * Output: { type: "result", slug, newCount } per series
 *         { type: "done" }
 */

var _nativeMode = false;

self.onmessage = async function (e) {
  const msg = e.data;
  if (msg.type !== "check") return;

  const { series, origin } = msg;
  _nativeMode = msg.nativeMode || false;

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
  if (source === "atsumaru") {
    return countAtsumaruChapters(s);
  }
  return countScrapedChapters(s.sourceUrl, source, origin);
}

async function countAtsumaruChapters(s) {
  if (!s.sourceId) return 0;
  var res = await fetch("https://atsu.moe/api/manga/allChapters?mangaId=" + s.sourceId);
  if (!res.ok) return 0;
  var data = await res.json();
  return Array.isArray(data.chapters) ? data.chapters.length : 0;
}

async function countMangaDexChapters(s, origin) {
  if (!s.sourceId) return 0;
  const lang = s.preferredLanguage || "en";

  if (_nativeMode) {
    // Direct MangaDex API — no CORS in native
    var res = await fetch(
      "https://api.mangadex.org/manga/" + s.sourceId + "/feed?translatedLanguage[]=" + encodeURIComponent(lang) + "&limit=1&offset=0"
    );
    if (!res.ok) return 0;
    var data = await res.json();
    return data.total || 0;
  }

  var res2 = await fetch(
    origin + "/api/mangadex/chapters?mangaId=" + s.sourceId + "&lang=" + lang
  );
  if (!res2.ok) return 0;
  var data2 = await res2.json();
  return Array.isArray(data2.chapters) ? data2.chapters.length : 0;
}

async function countScrapedChapters(sourceUrl, source, origin) {
  var fetchUrl;
  if (_nativeMode) {
    // Native: fetch directly from source (no CORS)
    fetchUrl = sourceUrl;
  } else {
    fetchUrl = origin + "/api/scrape?url=" + encodeURIComponent(sourceUrl);
  }

  const res = await fetch(fetchUrl);
  if (!res.ok) return 0;
  const html = await res.text();

  switch (source) {
    case "mangakatana":
      return countUniqueMatches(html, /\/c\d+/g);
    case "weebcentral":
      return countUniqueMatches(html, /\/chapters\/[A-Z0-9]+/g);
    case "mangabuddy":
      return countMangaBuddyChapters(html);
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

function countMangaBuddyChapters(html) {
  var matches = html.match(/chapter-(\d+(?:\.\d+)?)/g);
  if (!matches) return 0;
  var nums = matches.map(function(m) {
    var n = m.match(/chapter-(\d+)/);
    return n ? parseInt(n[1], 10) : 0;
  });
  return Math.max.apply(null, nums.concat([0]));
}

function countUniqueMatches(html, pattern) {
  const matches = html.match(pattern);
  if (!matches) return 0;
  return new Set(matches).size;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
