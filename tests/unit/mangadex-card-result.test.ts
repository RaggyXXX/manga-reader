import { describe, expect, it } from "vitest";
import { mapMangaDexCardResult } from "../../src/lib/mangadex-card-result";

describe("mapMangaDexCardResult", () => {
  it("does not derive list chapter counts from MangaDex lastChapter metadata", () => {
    const result = mapMangaDexCardResult({
      id: "abc123",
      attributes: {
        title: { en: "Naruto" },
        lastChapter: "700",
        availableTranslatedLanguages: ["en", "ja"],
      },
      relationships: [
        {
          type: "cover_art",
          attributes: { fileName: "cover.jpg" },
        },
      ],
    });

    expect(result).toMatchObject({
      title: "Naruto",
      source: "mangadex",
      sourceId: "abc123",
      sourceUrl: "https://mangadex.org/title/abc123",
      coverUrl: "https://uploads.mangadex.org/covers/abc123/cover.jpg.256.jpg",
      availableLanguages: ["en", "ja"],
    });
    expect(result.chapterCount).toBeUndefined();
  });
});
