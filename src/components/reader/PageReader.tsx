"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { ImageFitMode } from "@/lib/types";
import { imageProxyUrl } from "@/lib/scraper";
import styles from "./PageReader.module.css";

interface ModeProps {
  imageUrls: string[];
  imageFitMode: ImageFitMode;
  onCurrentChange: (index: number) => void;
  onScrollPercentChange: (percent: number) => void;
  onTap: () => void;
  nextChapter: number | null;
  onNavigateNext: () => void;
}

function getFitClass(mode: ImageFitMode): string {
  switch (mode) {
    case "fit-width":
      return styles.fitWidth;
    case "fit-height":
      return styles.fitHeight;
    case "original":
      return styles.fitOriginal;
    case "fit-screen":
      return styles.fitScreen;
  }
}

export default function PageReader({
  imageUrls,
  imageFitMode,
  onCurrentChange,
  onScrollPercentChange,
  onTap,
  nextChapter,
  onNavigateNext,
}: ModeProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [fadeState, setFadeState] = useState<"visible" | "entering">("visible");
  const [pastEnd, setPastEnd] = useState(false);

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const total = imageUrls.length;

  const reportProgress = useCallback(
    (page: number) => {
      onCurrentChange(page);
      onScrollPercentChange(total > 1 ? (page / (total - 1)) * 100 : 100);
    },
    [onCurrentChange, onScrollPercentChange, total]
  );

  const goToPage = useCallback(
    (page: number) => {
      if (page < 0) return;
      if (page >= total) {
        // Past the last page
        setPastEnd(true);
        return;
      }
      setPastEnd(false);
      setFadeState("entering");
      // After a brief moment, switch the page and fade in
      requestAnimationFrame(() => {
        setCurrentPage(page);
        reportProgress(page);
        // Let the browser paint with opacity 0, then transition to 1
        requestAnimationFrame(() => {
          setFadeState("visible");
        });
      });
    },
    [total, reportProgress]
  );

  const goNext = useCallback(() => {
    if (pastEnd) {
      if (nextChapter !== null) onNavigateNext();
      return;
    }
    goToPage(currentPage + 1);
  }, [currentPage, pastEnd, nextChapter, onNavigateNext, goToPage]);

  const goPrev = useCallback(() => {
    if (pastEnd) {
      setPastEnd(false);
      return;
    }
    goToPage(currentPage - 1);
  }, [currentPage, pastEnd, goToPage]);

  // Report initial state
  useEffect(() => {
    reportProgress(currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset to page 0 when imageUrls change (new chapter)
  useEffect(() => {
    setCurrentPage(0);
    setPastEnd(false);
    setFadeState("visible");
  }, [imageUrls]);

  // Touch / swipe handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;
      touchStartRef.current = null;

      // Only count horizontal swipes
      if (Math.abs(dx) > 50 && Math.abs(dy) < 50) {
        if (dx < 0) {
          // Swipe left -> next page
          goNext();
        } else {
          // Swipe right -> previous page
          goPrev();
        }
      }
    },
    [goNext, goPrev]
  );

  // Zone tap handlers
  const handleZonePrev = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      goPrev();
    },
    [goPrev]
  );

  const handleZoneCenter = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onTap();
    },
    [onTap]
  );

  const handleZoneNext = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      goNext();
    },
    [goNext]
  );

  const fitClass = getFitClass(imageFitMode);

  return (
    <div
      className={styles.container}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Touch zones */}
      <div className={styles.touchLayer}>
        <div className={styles.zonePrev} onClick={handleZonePrev} />
        <div className={styles.zoneCenter} onClick={handleZoneCenter} />
        <div className={styles.zoneNext} onClick={handleZoneNext} />
      </div>

      {/* Current image or end banner */}
      <div className={styles.imageWrapper}>
        {pastEnd ? (
          <div className={styles.endBanner}>
            {nextChapter !== null ? (
              <button
                className={styles.nextBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigateNext();
                }}
              >
                Naechstes Kapitel ({nextChapter}) &rarr;
              </button>
            ) : (
              <p className={styles.endText}>Ende der Serie</p>
            )}
          </div>
        ) : (
          <img
            key={currentPage}
            src={imageProxyUrl(imageUrls[currentPage])}
            alt={`Seite ${currentPage + 1}`}
            className={`${styles.pageImage} ${fitClass} ${
              fadeState === "entering" ? styles.entering : styles.visible
            }`}
            draggable={false}
          />
        )}
      </div>

      {/* Page counter */}
      {!pastEnd && (
        <div className={styles.pageCounter}>
          {currentPage + 1} / {total}
        </div>
      )}
    </div>
  );
}
