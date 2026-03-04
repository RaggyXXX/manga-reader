"use client";

import { useState, useEffect } from "react";
import styles from "./PreviewModal.module.css";
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

const STATUS_COLORS: Record<string, string> = {
  Completed: "#7ec88b",
  Ongoing: "#e8a849",
  Hiatus: "#e85d6f",
  Cancelled: "#8a7a6a",
};

interface PreviewData {
  title: string;
  coverUrl: string;
  sourceUrl: string;
  source: MangaSource;
  sourceId?: string;
}

interface PreviewMeta {
  title: string;
  description: string;
  status: string;
  author: string;
  genres: string[];
  chapterCount: number;
  year: number | null;
  coverUrl: string;
}

interface PreviewModalProps {
  data: PreviewData;
  onAdd: () => void;
  onClose: () => void;
  adding: boolean;
}

export function PreviewModal({ data, onAdd, onClose, adding }: PreviewModalProps) {
  const [meta, setMeta] = useState<PreviewMeta | null>(null);
  const [loading, setLoading] = useState(true);

  // MangaDex covers need proxying
  const imgSrc = data.coverUrl && data.source === "mangadex"
    ? `/api/mangadex/img?url=${encodeURIComponent(data.coverUrl)}`
    : data.coverUrl;

  useEffect(() => {
    let cancelled = false;

    async function fetchMeta() {
      try {
        const params = new URLSearchParams({
          url: data.sourceUrl,
          source: data.source,
        });
        if (data.sourceId) params.set("sourceId", data.sourceId);

        const resp = await fetch(`/api/preview?${params}`);
        if (!cancelled && resp.ok) {
          setMeta(await resp.json());
        }
      } catch { /* ignore */ }
      finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchMeta();
    return () => { cancelled = true; };
  }, [data.source, data.sourceId, data.sourceUrl]);

  const statusColor = meta ? STATUS_COLORS[meta.status] || "var(--text-muted)" : undefined;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button className={styles.closeBtn} onClick={onClose} type="button" aria-label="Schliessen">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Cover */}
        <div className={styles.coverWrap}>
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={data.title}
              className={styles.cover}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className={styles.coverPlaceholder}>
              {data.title.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Title + source */}
        <h2 className={styles.title}>{data.title}</h2>

        <div className={styles.badgeRow}>
          <span className={styles.badge} style={{ borderColor: SOURCE_COLORS[data.source] }}>
            <span className={styles.badgeDot} style={{ background: SOURCE_COLORS[data.source] }} />
            {SOURCE_LABELS[data.source]}
          </span>
          {loading ? (
            <span className={styles.statusShimmer} />
          ) : meta?.status && meta.status !== "Unknown" ? (
            <span className={styles.statusBadge} style={{ color: statusColor }}>
              {meta.status}
            </span>
          ) : null}
        </div>

        {/* Metadata grid */}
        <div className={styles.metaGrid}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Kapitel</span>
            <span className={styles.metaValue}>
              {loading ? <span className={styles.metaShimmer} /> : meta?.chapterCount ?? "—"}
            </span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Autor</span>
            <span className={styles.metaValueSmall}>
              {loading ? <span className={styles.metaShimmer} /> : meta?.author && meta.author !== "Unknown" ? meta.author : "—"}
            </span>
          </div>
        </div>

        {/* Genres */}
        {loading ? (
          <div className={styles.genreRow}>
            <span className={styles.genreShimmer} />
            <span className={styles.genreShimmer} />
            <span className={styles.genreShimmer} />
          </div>
        ) : meta?.genres && meta.genres.length > 0 ? (
          <div className={styles.genreRow}>
            {meta.genres.map((g) => (
              <span key={g} className={styles.genreTag}>{g}</span>
            ))}
          </div>
        ) : null}

        {/* Description */}
        {loading ? (
          <div className={styles.descShimmer}>
            <span /><span /><span />
          </div>
        ) : meta?.description ? (
          <p className={styles.description}>{meta.description.slice(0, 300)}{meta.description.length > 300 ? "..." : ""}</p>
        ) : null}

        {/* Add button */}
        <button
          className={styles.addBtn}
          onClick={onAdd}
          disabled={adding}
          type="button"
        >
          {adding ? (
            <span className={styles.spinner}>
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M16 2C16 2 18 8 22 12C26 16 32 16 32 16C32 16 26 18 22 22C18 26 16 32 16 32C16 32 14 26 10 22C6 18 0 16 0 16C0 16 6 14 10 10C14 6 16 2 16 2Z"
                  fill="#f2a0b3"
                  opacity="0.9"
                />
              </svg>
            </span>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Hinzufuegen
            </>
          )}
        </button>
      </div>
    </div>
  );
}
