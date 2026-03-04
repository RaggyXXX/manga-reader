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

const LANG_NAMES: Record<string, string> = {
  en: "English", de: "Deutsch", fr: "Français", es: "Español",
  "es-la": "Español (LA)", "pt-br": "Português (BR)", it: "Italiano",
  ru: "Русский", pl: "Polski", tr: "Türkçe", ar: "العربية",
  ja: "日本語", "ja-ro": "Japanese (Romaji)", ko: "한국어", "ko-ro": "Korean (Romaji)",
  zh: "中文", "zh-hk": "中文 (HK)", vi: "Tiếng Việt", th: "ไทย",
  id: "Bahasa Indonesia", ms: "Bahasa Melayu", tl: "Tagalog",
  hi: "हिन्दी", bn: "বাংলা", ta: "தமிழ்", te: "తెలుగు",
  my: "မြန်မာ", ka: "ქართული", uk: "Українська", cs: "Čeština",
  hu: "Magyar", ro: "Română", sv: "Svenska", nl: "Nederlands",
  el: "Ελληνικά", he: "עברית", fa: "فارسی", sr: "Српски",
  lt: "Lietuvių", kk: "Қазақша",
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
  altTitles: string[];
  description: string;
  status: string;
  author: string;
  artist: string;
  genres: string[];
  themes: string[];
  formats: string[];
  chapterCount: number;
  year: number | null;
  coverUrl: string;
  availableLanguages: string[];
  originalLanguage: string;
  contentRating: string;
  demographic: string;
  lastChapter: string;
  lastVolume: string;
  rating: string;
  follows: string;
  views: string;
  updatedAt: string;
  publishedRange: string;
  type: string;
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

  // Lock body scroll when open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const statusColor = meta ? STATUS_COLORS[meta.status] || "var(--text-muted)" : undefined;
  const sourceColor = SOURCE_COLORS[data.source];

  // Display cover from meta if available (higher res), fallback to search result cover
  const displayCover = meta?.coverUrl
    ? (data.source === "mangadex" ? `/api/mangadex/img?url=${encodeURIComponent(meta.coverUrl)}` : meta.coverUrl)
    : imgSrc;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button className={styles.closeBtn} onClick={onClose} type="button" aria-label="Schliessen">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Scrollable content */}
        <div className={styles.content}>
          {/* Cover */}
          <div className={styles.coverWrap}>
            {displayCover ? (
              <img src={displayCover} alt={data.title} className={styles.cover} referrerPolicy="no-referrer" />
            ) : (
              <div className={styles.coverPlaceholder}>
                {data.title.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Title */}
          <h2 className={styles.title}>{meta?.title || data.title}</h2>

          {/* Alt titles */}
          {!loading && meta?.altTitles && meta.altTitles.length > 0 && (
            <div className={styles.altTitles}>
              {meta.altTitles.slice(0, 5).map((t) => (
                <span key={t} className={styles.altTitle}>{t}</span>
              ))}
            </div>
          )}

          {/* Source + Status + Type badges */}
          <div className={styles.badgeRow}>
            <span className={styles.badge} style={{ borderColor: sourceColor }}>
              <span className={styles.badgeDot} style={{ background: sourceColor }} />
              {SOURCE_LABELS[data.source]}
            </span>
            {loading ? (
              <span className={styles.shimmerSmall} />
            ) : (
              <>
                {meta?.status && meta.status !== "Unknown" && (
                  <span className={styles.statusBadge} style={{ color: statusColor }}>
                    {meta.status}
                  </span>
                )}
                {meta?.type && (
                  <span className={styles.typeBadge}>{meta.type}</span>
                )}
                {meta?.contentRating && meta.contentRating !== "safe" && (
                  <span className={styles.ratingBadge}>{meta.contentRating}</span>
                )}
                {meta?.demographic && (
                  <span className={styles.demoBadge}>{meta.demographic}</span>
                )}
              </>
            )}
          </div>

          {/* Stats grid */}
          <div className={styles.statsGrid}>
            <StatItem label="Kapitel" loading={loading}>
              {meta?.chapterCount || "—"}
            </StatItem>
            <StatItem label="Jahr" loading={loading}>
              {meta?.year || "—"}
            </StatItem>
            {(loading || meta?.rating) && (
              <StatItem label="Bewertung" loading={loading}>
                {meta?.rating || "—"}
              </StatItem>
            )}
            {(loading || meta?.follows) && (
              <StatItem label="Folgt" loading={loading}>
                {meta?.follows || "—"}
              </StatItem>
            )}
          </div>

          {/* Author / Artist */}
          {loading ? (
            <div className={styles.metaLine}>
              <span className={styles.shimmerLine} />
            </div>
          ) : (
            <>
              {meta?.author && (
                <div className={styles.metaLine}>
                  <span className={styles.metaLineLabel}>Autor</span>
                  <span className={styles.metaLineValue}>{meta.author}</span>
                </div>
              )}
              {meta?.artist && meta.artist !== meta.author && (
                <div className={styles.metaLine}>
                  <span className={styles.metaLineLabel}>Kuenstler</span>
                  <span className={styles.metaLineValue}>{meta.artist}</span>
                </div>
              )}
              {meta?.publishedRange && (
                <div className={styles.metaLine}>
                  <span className={styles.metaLineLabel}>Veroeffentlicht</span>
                  <span className={styles.metaLineValue}>{meta.publishedRange}</span>
                </div>
              )}
              {meta?.lastChapter && (
                <div className={styles.metaLine}>
                  <span className={styles.metaLineLabel}>Letztes Kapitel</span>
                  <span className={styles.metaLineValue}>{meta.lastChapter}</span>
                </div>
              )}
              {meta?.lastVolume && (
                <div className={styles.metaLine}>
                  <span className={styles.metaLineLabel}>Letzter Band</span>
                  <span className={styles.metaLineValue}>{meta.lastVolume}</span>
                </div>
              )}
              {meta?.updatedAt && (
                <div className={styles.metaLine}>
                  <span className={styles.metaLineLabel}>Aktualisiert</span>
                  <span className={styles.metaLineValue}>
                    {meta.updatedAt.includes("T") ? new Date(meta.updatedAt).toLocaleDateString("de-DE") : meta.updatedAt}
                  </span>
                </div>
              )}
              {meta?.views && (
                <div className={styles.metaLine}>
                  <span className={styles.metaLineLabel}>Aufrufe</span>
                  <span className={styles.metaLineValue}>{meta.views}</span>
                </div>
              )}
            </>
          )}

          {/* Languages */}
          {loading ? (
            <div className={styles.section}>
              <span className={styles.sectionLabel}>Sprachen</span>
              <div className={styles.langRow}>
                <span className={styles.shimmerSmall} />
                <span className={styles.shimmerSmall} />
                <span className={styles.shimmerSmall} />
              </div>
            </div>
          ) : meta?.availableLanguages && meta.availableLanguages.length > 0 ? (
            <div className={styles.section}>
              <span className={styles.sectionLabel}>Sprachen ({meta.availableLanguages.length})</span>
              <div className={styles.langRow}>
                {meta.availableLanguages.map((lang) => (
                  <span
                    key={lang}
                    className={`${styles.langTag} ${lang === meta.originalLanguage ? styles.langTagOriginal : ""}`}
                    title={LANG_NAMES[lang] || lang}
                  >
                    {lang.toUpperCase()}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Genres */}
          {loading ? (
            <div className={styles.section}>
              <span className={styles.sectionLabel}>Genres</span>
              <div className={styles.tagRow}>
                <span className={styles.shimmerTag} />
                <span className={styles.shimmerTag} />
                <span className={styles.shimmerTag} />
              </div>
            </div>
          ) : meta?.genres && meta.genres.length > 0 ? (
            <div className={styles.section}>
              <span className={styles.sectionLabel}>Genres</span>
              <div className={styles.tagRow}>
                {meta.genres.map((g) => (
                  <span key={g} className={styles.genreTag}>{g}</span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Themes */}
          {!loading && meta?.themes && meta.themes.length > 0 && (
            <div className={styles.section}>
              <span className={styles.sectionLabel}>Themen</span>
              <div className={styles.tagRow}>
                {meta.themes.map((t) => (
                  <span key={t} className={styles.themeTag}>{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Formats */}
          {!loading && meta?.formats && meta.formats.length > 0 && (
            <div className={styles.section}>
              <span className={styles.sectionLabel}>Format</span>
              <div className={styles.tagRow}>
                {meta.formats.map((f) => (
                  <span key={f} className={styles.formatTag}>{f}</span>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {loading ? (
            <div className={styles.section}>
              <span className={styles.sectionLabel}>Beschreibung</span>
              <div className={styles.descShimmer}>
                <span /><span /><span /><span />
              </div>
            </div>
          ) : meta?.description ? (
            <div className={styles.section}>
              <span className={styles.sectionLabel}>Beschreibung</span>
              <p className={styles.description}>{meta.description}</p>
            </div>
          ) : null}
        </div>

        {/* Sticky add button */}
        <div className={styles.stickyFooter}>
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
    </div>
  );
}

function StatItem({ label, loading, children }: { label: string; loading: boolean; children: React.ReactNode }) {
  return (
    <div className={styles.statItem}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>
        {loading ? <span className={styles.shimmerValue} /> : children}
      </span>
    </div>
  );
}
