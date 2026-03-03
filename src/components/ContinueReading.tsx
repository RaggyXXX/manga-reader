"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getProgress, type SeriesProgress } from "@/lib/reading-progress";
import { imageProxyUrl } from "@/lib/scraper";
import styles from "./ContinueReading.module.css";

interface SeriesInfo {
  slug: string;
  title: string;
  coverUrl: string;
  totalChapters: number;
}

interface ContinueReadingItem {
  slug: string;
  title: string;
  coverUrl: string;
  lastReadChapter: number;
  scrollPercent: number;
  totalChapters: number;
}

interface ContinueReadingProps {
  series: SeriesInfo[];
}

export function ContinueReading({ series }: ContinueReadingProps) {
  const [items, setItems] = useState<ContinueReadingItem[]>([]);
  const router = useRouter();

  useEffect(() => {
    const result: ContinueReadingItem[] = [];

    for (const s of series) {
      const progress: SeriesProgress | null = getProgress(s.slug);
      if (!progress || !progress.lastReadChapter) continue;

      // Only show series that are genuinely unfinished
      const readCount = progress.readChapters?.length ?? 0;
      if (s.totalChapters > 0 && readCount >= s.totalChapters) continue;

      // Get scroll percent for the last-read chapter (0 if not tracked)
      const chapterPos = progress.chapterProgress?.[progress.lastReadChapter];
      const scrollPercent = chapterPos?.scrollPercent ?? 0;

      result.push({
        slug: s.slug,
        title: s.title,
        coverUrl: s.coverUrl,
        lastReadChapter: progress.lastReadChapter,
        scrollPercent,
        totalChapters: s.totalChapters,
      });
    }

    // Sort by most recently read (higher lastReadChapter timestamp via chapterProgress)
    result.sort((a, b) => {
      const progA = getProgress(a.slug);
      const progB = getProgress(b.slug);
      const tsA = progA?.chapterProgress?.[a.lastReadChapter]?.timestamp ?? 0;
      const tsB = progB?.chapterProgress?.[b.lastReadChapter]?.timestamp ?? 0;
      return tsB - tsA;
    });

    setItems(result);
  }, [series]);

  if (items.length === 0) return null;

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Weiterlesen</h2>

      <div className={styles.scrollRow}>
        {items.map((item) => {
          const chapterProgress =
            item.totalChapters > 0
              ? (item.lastReadChapter / item.totalChapters) * 100
              : 0;

          const coverSrc = item.coverUrl
            ? imageProxyUrl(item.coverUrl)
            : undefined;

          return (
            <button
              key={item.slug}
              className={styles.card}
              onClick={() =>
                router.push(`/read/${item.slug}/${item.lastReadChapter}`)
              }
              type="button"
              aria-label={`${item.title} weiterlesen — Kapitel ${item.lastReadChapter}`}
            >
              {/* Blurred cover background */}
              {coverSrc && (
                <div
                  className={styles.cardBg}
                  style={{ backgroundImage: `url(${coverSrc})` }}
                />
              )}

              {/* Gradient overlay */}
              <div className={styles.cardOverlay} />

              {/* Text content */}
              <div className={styles.cardContent}>
                <span className={styles.cardTitle}>{item.title}</span>
                <span className={styles.cardChapter}>
                  Kapitel {item.lastReadChapter}
                </span>

                {/* Progress bar */}
                <div className={styles.cardProgressTrack}>
                  <div
                    className={styles.cardProgress}
                    style={{ width: `${Math.min(chapterProgress, 100)}%` }}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
