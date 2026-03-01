"use client";

import Link from "next/link";
import styles from "./SeriesCard.module.css";
import { useEffect, useState } from "react";
import { getReadChapters } from "@/lib/reading-progress";

interface SeriesCardProps {
  slug: string;
  title: string;
  coverUrl?: string;
  totalChapters: number;
  crawledChapters: number;
  status: string;
}

export function SeriesCard({
  slug,
  title,
  coverUrl,
  totalChapters,
  crawledChapters,
  status,
}: SeriesCardProps) {
  const [readCount, setReadCount] = useState(0);

  useEffect(() => {
    setReadCount(getReadChapters(slug).length);
  }, [slug]);

  const progress = totalChapters > 0 ? (readCount / totalChapters) * 100 : 0;

  return (
    <Link href={`/series/${slug}`} className={styles.card}>
      <div className={styles.coverWrap}>
        {/* Cover image or placeholder */}
        {coverUrl ? (
          <img
            src={`/api/img?url=${encodeURIComponent(coverUrl)}`}
            alt={title}
            className={styles.cover}
            loading="lazy"
          />
        ) : (
          <div className={styles.placeholder}>
            <span className={styles.placeholderLetter}>
              {title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Bottom-to-top gradient overlay */}
        <div className={styles.gradient} />

        {/* Overlaid text content */}
        <div className={styles.overlay}>
          <span className={styles.chapterCount}>
            {readCount > 0
              ? `${readCount} / ${totalChapters} Kap.`
              : `${totalChapters} Kap.`}
          </span>
          <h3 className={styles.name}>{title}</h3>
        </div>

        {/* Discovering badge */}
        {status === "discovering" && (
          <div className={styles.badge}>Discovering</div>
        )}

        {/* Thin progress bar at the very bottom */}
        {readCount > 0 && (
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    </Link>
  );
}
