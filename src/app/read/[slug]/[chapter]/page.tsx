"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Reader from "@/components/reader/Reader";
import { getChapter, getChapters, getSeries, saveChapter } from "@/lib/manga-store";
import { imageProxyUrl, scrapeChapterImages } from "@/lib/scraper";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function ReaderPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const chapterNum = parseInt(params.chapter as string, 10);

  const [imageUrls, setImageUrls] = useState<string[] | null>(null);
  const [chapterTitle, setChapterTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allChapterNums, setAllChapterNums] = useState<number[]>([]);

  useEffect(() => {
    const chapters = getChapters(slug);
    setAllChapterNums(chapters.map((ch) => ch.number).sort((a, b) => a - b));
  }, [slug]);

  const fetchChapter = useCallback(async () => {
    setLoading(true);
    setError(null);

    const ch = getChapter(slug, chapterNum);
    if (!ch) {
      setError("Kapitel nicht gefunden.");
      setLoading(false);
      return;
    }

    setChapterTitle(ch.title);
    const series = getSeries(slug);
    const source = series?.source || "manhwazone";

    const needsRefresh =
      source === "mangadex" &&
      ch.imageUrls.length > 0 &&
      ch.syncedAt &&
      Date.now() - ch.syncedAt > 10 * 60 * 1000;

    if (ch.imageUrls.length > 0 && !needsRefresh) {
      setImageUrls(ch.imageUrls.map((u) => imageProxyUrl(u, source)));
      setLoading(false);
      return;
    }

    try {
      const images = await scrapeChapterImages(ch.url, source);
      if (images.length > 0) {
        saveChapter(slug, { ...ch, imageUrls: images, syncedAt: Date.now() });
        setImageUrls(images.map((u) => imageProxyUrl(u, source)));
      } else {
        setError("Keine Bilder gefunden.");
      }
    } catch {
      setError("Fehler beim Laden der Bilder.");
    } finally {
      setLoading(false);
    }
  }, [slug, chapterNum]);

  useEffect(() => {
    fetchChapter();
  }, [fetchChapter]);

  const currentIndex = allChapterNums.indexOf(chapterNum);
  const prevChapter = currentIndex > 0 ? allChapterNums[currentIndex - 1] : null;
  const nextChapter = currentIndex < allChapterNums.length - 1 ? allChapterNums[currentIndex + 1] : null;

  const goToChapter = (num: number) => {
    setImageUrls(null);
    setLoading(true);
    setError(null);
    router.push(`/read/${slug}/${num}`);
  };

  if (loading && !imageUrls) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="space-y-3 p-6 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            <p className="text-sm text-muted-foreground">Kapitel wird geladen...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-3 p-6 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button onClick={fetchChapter}>Erneut versuchen</Button>
              <Button variant="outline" onClick={() => router.back()}>
                Zurueck
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!imageUrls || imageUrls.length === 0) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-3 p-6 text-center">
            <p className="text-sm text-muted-foreground">Keine Bilder gefunden.</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button onClick={fetchChapter}>Erneut versuchen</Button>
              <Button variant="outline" onClick={() => router.back()}>
                Zurueck
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Reader
      slug={slug}
      chapterNumber={chapterNum}
      title={chapterTitle}
      imageUrls={imageUrls}
      prevChapter={prevChapter}
      nextChapter={nextChapter}
      allChapterNums={allChapterNums}
      onNavigate={goToChapter}
    />
  );
}
