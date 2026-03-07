import type { MangaSource } from "./manga-store";

interface MangaDexRelationship {
  type?: string;
  attributes?: {
    fileName?: string;
  };
}

interface MangaDexMangaRecord {
  id: string;
  attributes?: {
    title?: Record<string, string>;
    availableTranslatedLanguages?: string[];
    lastChapter?: string | null;
  };
  relationships?: MangaDexRelationship[];
}

export interface MangaDexCardResult {
  title: string;
  coverUrl: string;
  sourceUrl: string;
  source: MangaSource;
  sourceId: string;
  availableLanguages: string[];
  chapterCount?: number;
}

function pickTitle(titleObj: Record<string, string> | undefined): string {
  if (!titleObj) return "Unknown";
  return titleObj.en || titleObj.ja || titleObj["ja-ro"] || Object.values(titleObj)[0] || "Unknown";
}

export function mapMangaDexCardResult(manga: MangaDexMangaRecord): MangaDexCardResult {
  const id = manga.id;
  const attrs = manga.attributes || {};
  const title = pickTitle(attrs.title);

  let coverFileName = "";
  for (const rel of manga.relationships || []) {
    if (rel.type === "cover_art" && rel.attributes?.fileName) {
      coverFileName = rel.attributes.fileName;
      break;
    }
  }

  return {
    title,
    coverUrl: coverFileName ? `https://uploads.mangadex.org/covers/${id}/${coverFileName}.256.jpg` : "",
    sourceUrl: `https://mangadex.org/title/${id}`,
    source: "mangadex",
    sourceId: id,
    availableLanguages: attrs.availableTranslatedLanguages || [],
    // MangaDex lastChapter is not a reliable "chapter count" for list cards.
    chapterCount: undefined,
  };
}
