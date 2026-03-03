"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getReadingStats, type ReadingStats } from "@/lib/reading-progress";
import { getAllSeries, deleteSeries as deleteStoredSeries, getChapters } from "@/lib/manga-store";
import styles from "./page.module.css";

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return "Unbekannt";
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 30) {
    const months = Math.floor(days / 30);
    return `vor ${months} ${months === 1 ? "Monat" : "Monaten"}`;
  }
  if (days > 0) return `vor ${days} ${days === 1 ? "Tag" : "Tagen"}`;
  if (hours > 0) return `vor ${hours} ${hours === 1 ? "Stunde" : "Stunden"}`;
  if (minutes > 0) return `vor ${minutes} ${minutes === 1 ? "Minute" : "Minuten"}`;
  return "Gerade eben";
}

function formatSlug(slug: string): string {
  return slug.replace(/-/g, " ");
}

function formatReadingTime(minutes: number): string {
  if (minutes < 60) return `${minutes} Min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (remaining === 0) return `${hours} Std`;
  return `${hours} Std ${remaining} Min`;
}

/* ── SVG icon components ─────────────────────────────── */

function ArrowLeftIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function SakuraIcon() {
  return (
    <svg
      className={styles.sakuraIcon}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 2C12 2 14 6.5 14 8.5C14 10.5 12 12 12 12C12 12 10 10.5 10 8.5C10 6.5 12 2 12 2Z"
        fill="#f2a0b3"
        opacity="0.9"
      />
      <path
        d="M22 12C22 12 17.5 14 15.5 14C13.5 14 12 12 12 12C12 12 13.5 10 15.5 10C17.5 10 22 12 22 12Z"
        fill="#f2a0b3"
        opacity="0.75"
      />
      <path
        d="M12 22C12 22 10 17.5 10 15.5C10 13.5 12 12 12 12C12 12 14 13.5 14 15.5C14 17.5 12 22 12 22Z"
        fill="#f2a0b3"
        opacity="0.65"
      />
      <path
        d="M2 12C2 12 6.5 10 8.5 10C10.5 10 12 12 12 12C12 12 10.5 14 8.5 14C6.5 14 2 12 2 12Z"
        fill="#f2a0b3"
        opacity="0.8"
      />
      <circle cx="12" cy="12" r="2.5" fill="#e8a849" opacity="0.9" />
    </svg>
  );
}

function EmptyBookIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <line x1="9" y1="10" x2="15" y2="10" />
      <line x1="9" y1="14" x2="13" y2="14" />
    </svg>
  );
}

/* ── Main page component ─────────────────────────────── */

export default function StatsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<ReadingStats | null>(null);
  const [seriesList, setSeriesList] = useState<Array<{ slug: string; title: string; cachedCount: number; totalChapters: number }>>([]);

  useEffect(() => {
    setStats(getReadingStats());
    const all = getAllSeries();
    setSeriesList(all.map((s) => ({
      slug: s.slug,
      title: s.title,
      cachedCount: getChapters(s.slug).filter((ch) => ch.imageUrls.length > 0).length,
      totalChapters: s.totalChapters || getChapters(s.slug).length,
    })));
  }, []);

  const handleClearSeries = (slug: string) => {
    deleteStoredSeries(slug);
    setSeriesList((prev) => prev.filter((s) => s.slug !== slug));
  };

  const handleClearAll = () => {
    for (const s of seriesList) {
      deleteStoredSeries(s.slug);
    }
    setSeriesList([]);
  };

  if (!stats) return null; // loading from localStorage

  const hasData = stats.totalChaptersRead > 0;

  // Find max chapters across all series (for progress bar scaling)
  const maxChapters = hasData
    ? Math.max(...stats.seriesStats.map((s) => s.chaptersRead))
    : 1;

  return (
    <div className={styles.page}>
      {/* Back button */}
      <button className={styles.backBtn} onClick={() => router.push("/")}>
        <ArrowLeftIcon />
        Zurueck
      </button>

      {/* Header */}
      <div className={styles.header}>
        <SakuraIcon />
        <h1 className={styles.headerTitle}>Lesestatistiken</h1>
      </div>

      {hasData ? (
        <>
          {/* Stat cards */}
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statIcon}>
                <BookIcon />
              </div>
              <div className={styles.statValue}>{stats.totalChaptersRead}</div>
              <div className={styles.statLabel}>Kapitel gelesen</div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statIcon}>
                <ImageIcon />
              </div>
              <div className={styles.statValue}>{stats.totalPagesViewed}</div>
              <div className={styles.statLabel}>Seiten angesehen</div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statIcon}>
                <ClockIcon />
              </div>
              <div className={styles.statValue}>
                {formatReadingTime(stats.estimatedMinutes)}
              </div>
              <div className={styles.statLabel}>Lesezeit</div>
            </div>
          </div>

          {/* Per-series breakdown */}
          <section className={styles.seriesSection}>
            <h2 className={styles.seriesSectionTitle}>Pro Serie</h2>
            <div className={styles.seriesList}>
              {stats.seriesStats.map((series) => (
                <div key={series.slug} className={styles.seriesItem}>
                  <div className={styles.seriesTop}>
                    <span className={styles.seriesName}>
                      {formatSlug(series.slug)}
                    </span>
                    <span className={styles.seriesDetail}>
                      Zuletzt: Kapitel {series.lastReadChapter}
                    </span>
                  </div>
                  <div className={styles.seriesDetail}>
                    {series.chaptersRead} Kapitel gelesen
                  </div>
                  <div className={styles.seriesBottom}>
                    <div className={styles.progressBarOuter}>
                      <div
                        className={styles.progressBarFill}
                        style={{
                          width: `${Math.round(
                            (series.chaptersRead / maxChapters) * 100
                          )}%`,
                        }}
                      />
                    </div>
                    <span className={styles.timestamp}>
                      Zuletzt gelesen: {formatRelativeTime(series.lastReadAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        /* Empty state */
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <EmptyBookIcon />
          </div>
          <p className={styles.emptyTitle}>Noch keine Lesefortschritte</p>
          <p className={styles.emptySubtitle}>
            Beginne eine Serie zu lesen, um deine Statistiken hier zu sehen.
          </p>
        </div>
      )}

      {/* Offline Storage Section */}
      <section className={styles.seriesSection} style={{ marginTop: "2rem" }}>
        <h2 className={styles.seriesSectionTitle}>Offline-Speicher</h2>
        {seriesList.length === 0 ? (
          <p style={{ color: "var(--text-muted)", padding: "1rem 0" }}>Keine gespeicherten Serien</p>
        ) : (
          <>
            <div className={styles.seriesList}>
              {seriesList.map((s) => (
                <div key={s.slug} className={styles.seriesItem}>
                  <div className={styles.seriesTop}>
                    <span className={styles.seriesName}>{s.title}</span>
                    <span className={styles.seriesDetail}>
                      {s.cachedCount} / {s.totalChapters} Kapitel gecacht
                    </span>
                  </div>
                  <button
                    onClick={() => handleClearSeries(s.slug)}
                    style={{
                      marginTop: "0.5rem",
                      padding: "0.4rem 0.8rem",
                      background: "var(--bg-elevated)",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "0.8rem",
                      cursor: "pointer",
                    }}
                  >
                    Cache loeschen
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={handleClearAll}
              style={{
                marginTop: "1rem",
                padding: "0.5rem 1rem",
                background: "var(--error)",
                color: "white",
                border: "none",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.85rem",
                cursor: "pointer",
              }}
            >
              Alles loeschen
            </button>
          </>
        )}
      </section>
    </div>
  );
}
