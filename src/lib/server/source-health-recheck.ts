import type { MangaSource } from "@/lib/manga-store";
import {
  ALL_SOURCES,
  getSourceAvailability,
  recordSourceFailure,
  recordSourceSuccess,
  shouldRecheckSource,
  syncSourceHealthFromStore,
} from "@/lib/source-health";
import { fetchWithH2, postWithH2 } from "./fetch-h2";

const PROBE_QUERY = "one";

function ensureHtml(body: string, source: MangaSource) {
  const sample = body.slice(0, 500).toLowerCase();
  if (!sample.includes("<html") && !sample.includes("<!doctype")) {
    throw new Error(`${source} probe returned non-html`);
  }
  if (
    sample.includes("just a moment") ||
    sample.includes("cf-challenge") ||
    sample.includes("attention required") ||
    sample.includes("access denied")
  ) {
    throw new Error(`${source} probe returned challenge page`);
  }
}

async function probeSource(source: MangaSource) {
  switch (source) {
    case "mangadex": {
      const response = await fetch("https://api.mangadex.org/manga?limit=1", {
        headers: { "User-Agent": "MangaBlastPWA/1.0" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`MangaDex probe ${response.status}`);
      return;
    }
    case "atsumaru": {
      const response = await fetch(
        `https://atsu.moe/collections/manga/documents/search?q=${encodeURIComponent(PROBE_QUERY)}&query_by=title&limit=1`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(`Atsumaru probe ${response.status}`);
      return;
    }
    case "mangabuddy": {
      const response = await fetch(`https://mangabuddy.com/api/manga/search?q=${encodeURIComponent(PROBE_QUERY)}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`MangaBuddy probe ${response.status}`);
      return;
    }
    case "mangakatana": {
      const response = await fetch(
        `https://mangakatana.com/?search=${encodeURIComponent(PROBE_QUERY)}&search_by=book_name`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(`MangaKatana probe ${response.status}`);
      ensureHtml(await response.text(), source);
      return;
    }
    case "manhwazone": {
      const { body } = await fetchWithH2(`https://manhwazone.to/search?keyword=${encodeURIComponent(PROBE_QUERY)}`, false);
      ensureHtml(body, source);
      return;
    }
    case "weebcentral": {
      const { body } = await postWithH2(
        "https://weebcentral.com/search/simple?location=main",
        `text=${encodeURIComponent(PROBE_QUERY)}`,
        { "HX-Request": "true" },
      );
      if (!body.includes("/series/")) {
        throw new Error("WeebCentral probe returned no results");
      }
      return;
    }
    default:
      return;
  }
}

export async function recheckDueSources(now = Date.now()) {
  await syncSourceHealthFromStore();

  for (const source of ALL_SOURCES) {
    const availability = getSourceAvailability(source);
    if (availability.status !== "broken" || !shouldRecheckSource(source, now)) {
      continue;
    }

    try {
      await probeSource(source);
      await recordSourceSuccess(source);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Probe failed";
      await recordSourceFailure(source, message, now, "strong");
    }
  }
}
