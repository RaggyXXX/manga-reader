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

// Highlight these languages at the front
const PRIORITY_LANGS = ["en", "de", "fr", "es", "ja", "ko"];

interface SearchResultCardProps {
  title: string;
  coverUrl: string;
  source: MangaSource;
  availableLanguages?: string[];
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function SearchResultCard({
  title,
  coverUrl,
  source,
  availableLanguages,
  loading,
  disabled,
  onClick,
}: SearchResultCardProps) {
  // Sort languages: priority first, then rest
  const sortedLangs = availableLanguages
    ? [...availableLanguages].sort((a, b) => {
        const ai = PRIORITY_LANGS.indexOf(a);
        const bi = PRIORITY_LANGS.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.localeCompare(b);
      })
    : [];
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
        <div className={styles.metaRow}>
          <span className={styles.badge}>
            <span className={styles.badgeDot} style={{ background: SOURCE_COLORS[source] }} />
            <span className={styles.badgeName}>{SOURCE_LABELS[source]}</span>
          </span>
          {sortedLangs.length > 0 && (
            <span className={styles.langBadges}>
              {sortedLangs.slice(0, 5).map((lang) => (
                <span key={lang} className={styles.langBadge}>{lang.toUpperCase()}</span>
              ))}
              {sortedLangs.length > 5 && (
                <span className={styles.langMore}>+{sortedLangs.length - 5}</span>
              )}
            </span>
          )}
        </div>
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
