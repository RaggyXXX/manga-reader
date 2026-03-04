"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Reader from "@/components/reader/Reader";
import { getChapters, getChapter, saveChapter, getSeries } from "@/lib/manga-store";
import { scrapeChapterImages, imageProxyUrl } from "@/lib/scraper";
import styles from "./page.module.css";

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

  // Load chapter list for navigation
  useEffect(() => {
    const chapters = getChapters(slug);
    setAllChapterNums(chapters.map((ch) => ch.number).sort((a, b) => a - b));
  }, [slug]);

  // Load current chapter
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

    // For MangaDex, re-fetch image URLs if syncedAt is older than 10 min (URLs expire)
    const needsRefresh = source === "mangadex" && ch.imageUrls.length > 0 && ch.syncedAt && (Date.now() - ch.syncedAt > 10 * 60 * 1000);

    // Already synced (and not expired) — show immediately
    if (ch.imageUrls.length > 0 && !needsRefresh) {
      setImageUrls(ch.imageUrls.map((u) => imageProxyUrl(u, source)));
      setLoading(false);
      return;
    }

    // Not synced or needs refresh — scrape on-demand
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
      <div className={styles.loading}>
        <svg className={styles.spinner} width="48" height="48" viewBox="0 0 48 48" fill="none">
          <path d="M24 4C24 4 28 13 28 17C28 21 24 24 24 24C24 24 20 21 20 17C20 13 24 4 24 4Z" fill="#f2a0b3" opacity="0.9" />
          <path d="M44 24C44 24 35 28 31 28C27 28 24 24 24 24C24 24 27 20 31 20C35 20 44 24 44 24Z" fill="#f2a0b3" opacity="0.75" />
          <path d="M24 44C24 44 20 35 20 31C20 27 24 24 24 24C24 24 28 27 28 31C28 35 24 44 24 44Z" fill="#f2a0b3" opacity="0.65" />
          <path d="M4 24C4 24 13 20 17 20C21 20 24 24 24 24C24 24 21 28 17 28C13 28 4 24 4 24Z" fill="#f2a0b3" opacity="0.8" />
          <circle cx="24" cy="24" r="5" fill="#e8a849" opacity="0.9" />
        </svg>
        <p>Kapitel wird geladen...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.loading}>
        <p className={styles.errorText}>{error}</p>
        <button className={styles.retryBtn} onClick={fetchChapter}>
          Erneut versuchen
        </button>
        <button
          className={styles.retryBtn}
          onClick={() => router.back()}
          style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
        >
          Zurueck
        </button>
      </div>
    );
  }

  if (!imageUrls || imageUrls.length === 0) {
    return (
      <div className={styles.loading}>
        <p>Keine Bilder gefunden.</p>
        <button className={styles.retryBtn} onClick={fetchChapter}>
          Erneut versuchen
        </button>
        <button
          className={styles.retryBtn}
          onClick={() => router.back()}
          style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
        >
          Zurueck
        </button>
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
