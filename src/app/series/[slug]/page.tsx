"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSeries, getChapters, type StoredSeries, type StoredChapter } from "@/lib/manga-store";
import { ChapterList } from "@/components/ChapterList";
import { DeleteSeriesButton } from "./DeleteSeriesButton";
import styles from "./page.module.css";
import Link from "next/link";

export default function SeriesPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [series, setSeries] = useState<StoredSeries | null>(null);
  const [chapters, setChapters] = useState<StoredChapter[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const s = getSeries(slug);
    if (!s) {
      router.push("/");
      return;
    }
    setSeries(s);
    setChapters(getChapters(slug));
    setLoaded(true);
  }, [slug, router]);

  if (!loaded || !series) return null;

  const syncedCount = chapters.filter((ch) => ch.imageUrls.length > 0).length;

  const chaptersPlain = chapters.map((ch) => ({
    number: ch.number,
    title: ch.title,
    status: ch.imageUrls.length > 0 ? "crawled" : "pending",
    pageCount: ch.imageUrls.length,
  }));

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.backBtn} aria-label="Zurueck">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <h1 className={styles.headerTitle}>{series.title}</h1>
      </header>

      <div className={styles.infoCard}>
        {series.coverUrl ? (
          <img
            src={`/api/proxy?url=${encodeURIComponent(series.coverUrl)}`}
            alt={series.title}
            className={styles.cover}
          />
        ) : (
          <div className={styles.coverPlaceholder}>&#9744;</div>
        )}

        <div className={styles.details}>
          <h2 className={styles.seriesTitle}>{series.title}</h2>
          <div className={styles.badges}>
            <span className={styles.badge}>
              {series.totalChapters || chapters.length} Kapitel
            </span>
            <span className={`${styles.badge} ${styles.badgeCrawled}`}>
              {syncedCount} bereit
            </span>
          </div>
        </div>
      </div>

      <div className={styles.dangerZone}>
        <DeleteSeriesButton seriesSlug={slug} seriesTitle={series.title} />
      </div>

      <ChapterList
        chapters={chaptersPlain}
        seriesSlug={slug}
      />
    </div>
  );
}
