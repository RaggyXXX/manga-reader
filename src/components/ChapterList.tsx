"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import styles from "./ChapterList.module.css";
import {
  getReadChapters,
  markAllChaptersRead,
  clearSeriesProgress,
} from "@/lib/reading-progress";
import { useSyncContext } from "@/contexts/SyncContext";

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
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(false);
  const { phase, slug: syncSlug, startSync, stopSync } = useSyncContext();

  const isSyncing = phase !== "idle" && phase !== "error" && syncSlug === seriesSlug;

  useEffect(() => {
    setReadChapters(new Set(getReadChapters(seriesSlug)));
  }, [seriesSlug]);

  /* ── Sync handler ── */
  const handleSync = useCallback(() => {
    startSync(seriesSlug);
  }, [seriesSlug, startSync]);

  const handleStopSync = useCallback(() => {
    stopSync();
  }, [stopSync]);

  /* ── Mark all / clear all ── */
  const handleMarkAllRead = useCallback(() => {
    const allNumbers = chapters.map((ch) => ch.number);
    markAllChaptersRead(seriesSlug, allNumbers);
    setReadChapters(new Set(allNumbers));
  }, [chapters, seriesSlug]);

  const handleClearProgress = useCallback(() => {
    clearSeriesProgress(seriesSlug);
    setReadChapters(new Set());
  }, [seriesSlug]);

  /* ── Filtered + sorted chapters ── */
  const filteredChapters = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = chapters;

    if (q) {
      result = chapters.filter(
        (ch) =>
          String(ch.number).includes(q) ||
          ch.title.toLowerCase().includes(q)
      );
    }

    return sortAsc ? result : [...result].reverse();
  }, [chapters, search, sortAsc]);

  const pendingCount = chapters.filter(
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
          {pendingCount > 0 ? `${pendingCount} Kapitel noch nicht geladen` : `${chapters.length} Kapitel`}
        </span>
        <button
          className={styles.syncBtn}
          onClick={isSyncing ? handleStopSync : handleSync}
          type="button"
        >
          {isSyncing ? "Stop" : "Sync All"}
        </button>
      </div>

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
