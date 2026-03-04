"use client";

import styles from "./SearchResultCard.module.css";
import type { MangaSource } from "@/lib/manga-store";

const SOURCE_COLORS: Record<MangaSource, string> = {
  mangadex: "#ff6740",
  mangakatana: "#4a90d9",
  vymanga: "#6bc95b",
  manhwazone: "#e8a849",
};

const SOURCE_LABELS: Record<MangaSource, string> = {
  mangadex: "MangaDex",
  mangakatana: "MangaKatana",
  vymanga: "VyManga",
  manhwazone: "Manhwazone",
};

interface SearchResultCardProps {
  title: string;
  coverUrl: string;
  source: MangaSource;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function SearchResultCard({
  title,
  coverUrl,
  source,
  loading,
  disabled,
  onClick,
}: SearchResultCardProps) {
  // MangaDex covers need proxying
  const imgSrc = coverUrl && source === "mangadex"
    ? `/api/mangadex/img?url=${encodeURIComponent(coverUrl)}`
    : coverUrl;

  return (
    <button
      className={`${styles.card} ${disabled ? styles.disabled : ""}`}
      onClick={onClick}
      disabled={disabled || loading}
      type="button"
    >
      {imgSrc ? (
        <img
          src={imgSrc}
          alt={title}
          className={styles.cover}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className={styles.coverPlaceholder}>
          {title.charAt(0).toUpperCase()}
        </div>
      )}

      <div className={styles.info}>
        <span className={styles.title}>{title}</span>
        <span className={styles.badge}>
          <span className={styles.badgeDot} style={{ background: SOURCE_COLORS[source] }} />
          <span className={styles.badgeName}>{SOURCE_LABELS[source]}</span>
        </span>
      </div>

      {loading && (
        <div className={styles.loadingOverlay}>
          <span className={styles.loadingSpinner}>
            <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M16 2C16 2 18 8 22 12C26 16 32 16 32 16C32 16 26 18 22 22C18 26 16 32 16 32C16 32 14 26 10 22C6 18 0 16 0 16C0 16 6 14 10 10C14 6 16 2 16 2Z"
                fill="#f2a0b3"
                opacity="0.9"
              />
            </svg>
          </span>
        </div>
      )}
    </button>
  );
}
