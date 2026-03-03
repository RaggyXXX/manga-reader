"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import styles from "./ChapterList.module.css";
import {
  getReadChapters,
  markAllChaptersRead,
  clearSeriesProgress,
} from "@/lib/reading-progress";
import {
  discoverSeries,
  discoverAllChapters,
  scrapeChapterImages,
} from "@/lib/scraper";
import {
  getSeries,
  getChapters as getLocalChapters,
  saveChapters,
  saveChapter,
  updateSeriesTotalChapters,
  type StoredChapter,
} from "@/lib/manga-store";

interface ChapterItem {
  number: number;
  title: string;
  status: string;
  pageCount: number;
}

interface Props {
  chapters: ChapterItem[];
  seriesSlug: string;
}

export function ChapterList({ chapters, seriesSlug }: Props) {
  const [readChapters, setReadChapters] = useState<Set<number>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(false);
  const [syncAbort, setSyncAbort] = useState<AbortController | null>(null);

  useEffect(() => {
    setReadChapters(new Set(getReadChapters(seriesSlug)));
  }, [seriesSlug]);

  const [localChapters, setLocalChapters] = useState<StoredChapter[]>([]);
  const [syncPhase, setSyncPhase] = useState<"idle" | "discovering" | "scraping">("idle");

  /* ── Sync handler ── */
  const handleSync = useCallback(async () => {
    setSyncing(true);
    const abort = new AbortController();
    setSyncAbort(abort);

    try {
      const series = getSeries(seriesSlug);
      if (!series) return;

      let stored = getLocalChapters(seriesSlug);

      // Phase 1: Discover chapters if we don't have any
      if (stored.length === 0 && series.sourceUrl) {
        setSyncPhase("discovering");
        const discovered = await discoverSeries(series.sourceUrl);

        if (discovered.firstChapterUrl) {
          setSyncProgress({ completed: 0, total: 0 });

          await discoverAllChapters(
            discovered.firstChapterUrl,
            (count, chapter) => {
              // Save each chapter as it's discovered
              if (chapter) {
                const stored: StoredChapter = {
                  number: chapter.number,
                  title: chapter.title,
                  url: chapter.url,
                  imageUrls: [],
                  syncedAt: null,
                };
                saveChapter(seriesSlug, stored);
                updateSeriesTotalChapters(seriesSlug, count);
                setLocalChapters(getLocalChapters(seriesSlug));
              }
              setSyncProgress({ completed: count, total: 0 });
            },
            abort.signal
          );

          stored = getLocalChapters(seriesSlug);
        }
      }

      // Phase 2: Scrape images for unsynced chapters
      setSyncPhase("scraping");
      const unsynced = stored.filter((ch) => ch.imageUrls.length === 0);
      const total = stored.length;
      const alreadySynced = total - unsynced.length;

      setSyncProgress({ completed: alreadySynced, total });

      for (let i = 0; i < unsynced.length; i++) {
        if (abort.signal.aborted) break;

        const ch = unsynced[i];
        try {
          const imageUrls = await scrapeChapterImages(ch.url);
          saveChapter(seriesSlug, { ...ch, imageUrls, syncedAt: Date.now() });
          setLocalChapters(getLocalChapters(seriesSlug));
          setSyncProgress({ completed: alreadySynced + i + 1, total });
        } catch {
          // Skip failed chapter, continue with next
        }

        if (i < unsynced.length - 1 && !abort.signal.aborted) {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }

      window.location.reload();
    } catch {
      // Aborted or failed
    } finally {
      setSyncing(false);
      setSyncProgress(null);
      setSyncAbort(null);
      setSyncPhase("idle");
    }
  }, [seriesSlug]);

  /* ── Stop handler ── */
  const handleStopSync = useCallback(() => {
    syncAbort?.abort();
  }, [syncAbort]);

  /* ── Merge prop chapters with live local state ── */
  const displayChapters = useMemo(() => {
    if (localChapters.length > 0) {
      return localChapters.map((ch) => ({
        number: ch.number,
        title: ch.title,
        status: ch.imageUrls.length > 0 ? "crawled" : "pending",
        pageCount: ch.imageUrls.length,
      }));
    }
    return chapters;
  }, [chapters, localChapters]);

  /* ── Mark all / clear all ── */
  const handleMarkAllRead = useCallback(() => {
    const allNumbers = displayChapters.map((ch) => ch.number);
    markAllChaptersRead(seriesSlug, allNumbers);
    setReadChapters(new Set(allNumbers));
  }, [displayChapters, seriesSlug]);

  const handleClearProgress = useCallback(() => {
    clearSeriesProgress(seriesSlug);
    setReadChapters(new Set());
  }, [seriesSlug]);

  /* ── Filtered + sorted chapters ── */
  const filteredChapters = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = displayChapters;

    if (q) {
      result = displayChapters.filter(
        (ch) =>
          String(ch.number).includes(q) ||
          ch.title.toLowerCase().includes(q)
      );
    }

    return sortAsc ? result : [...result].reverse();
  }, [displayChapters, search, sortAsc]);

  const pendingCount = displayChapters.filter(
    (ch) => ch.status === "pending"
  ).length;

  return (
    <div className={styles.container}>
      {/* Toolbar: search + sort + bulk actions */}
      <div className={styles.toolbar}>
        <div className={styles.searchRow}>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Kapitel suchen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            className={styles.sortBtn}
            onClick={() => setSortAsc((p) => !p)}
            title={sortAsc ? "Absteigend sortieren" : "Aufsteigend sortieren"}
            type="button"
          >
            {sortAsc ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 3 18 9" />
                <line x1="12" y1="3" x2="12" y2="21" />
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 15 12 21 18 15" />
                <line x1="12" y1="21" x2="12" y2="3" />
              </svg>
            )}
          </button>
        </div>

        <div className={styles.actionsRow}>
          <button
            className={styles.actionBtn}
            onClick={handleMarkAllRead}
            type="button"
          >
            Alle gelesen
          </button>
          <button
            className={styles.actionBtn}
            onClick={handleClearProgress}
            type="button"
          >
            Alle ungelesen
          </button>
        </div>
      </div>

      {/* Sync bar */}
      <div className={styles.syncBar}>
        <span className={styles.syncInfo}>
          <span className={styles.syncDot} />
          {pendingCount > 0 ? `${pendingCount} Kapitel noch nicht geladen` : `${displayChapters.length} Kapitel`}
        </span>
        <button
          className={styles.syncBtn}
          onClick={syncing ? handleStopSync : handleSync}
          type="button"
        >
          {syncing ? "Stop" : "Sync All"}
        </button>
      </div>

      {/* Progress bar during sync */}
      {syncing && syncProgress && (
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{
              width: `${
                syncPhase === "discovering"
                  ? 100 // Indeterminate for discovery
                  : syncProgress.total > 0
                  ? (syncProgress.completed / syncProgress.total) * 100
                  : 0
              }%`,
            }}
          />
          <span className={styles.progressText}>
            {syncPhase === "discovering"
              ? `Kapitel entdecken... ${syncProgress.completed} gefunden`
              : `${syncProgress.completed} / ${syncProgress.total}`}
          </span>
        </div>
      )}

      {/* Chapter list */}
      {filteredChapters.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>&#128269;</div>
          <p className={styles.emptyText}>Keine Kapitel gefunden</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {filteredChapters.map((ch) => {
            const isRead = readChapters.has(ch.number);
            const readTime =
              ch.pageCount > 0 ? Math.max(1, Math.round(ch.pageCount * 0.5)) : 0;

            return (
              <li key={ch.number} className={styles.item}>
                <Link
                  href={`/read/${seriesSlug}/${ch.number}`}
                  className={`${styles.link} ${isRead ? styles.read : ""}`}
                >
                  <span
                    className={`${styles.dot} ${
                      ch.status === "crawled"
                        ? isRead
                          ? styles.dotRead
                          : styles.dotReady
                        : ch.status === "error"
                        ? styles.dotError
                        : styles.dotPending
                    }`}
                  />
                  {isRead && <span className={styles.readPrefix}>&#10003;</span>}
                  <span className={styles.number}>#{ch.number}</span>
                  <span className={styles.chTitle}>{ch.title}</span>
                  <span className={styles.meta}>
                    {readTime > 0 && (
                      <span className={styles.readTime}>~{readTime} min</span>
                    )}
                    {ch.pageCount > 0 && (
                      <span className={styles.pages}>{ch.pageCount}p</span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
