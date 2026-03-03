"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { ImageFitMode } from "@/lib/types";
import { imageProxyUrl } from "@/lib/scraper";
import styles from "./RtlReader.module.css";

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

export default function RtlReader({
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
        setPastEnd(true);
        return;
      }
      setPastEnd(false);
      setFadeState("entering");
      requestAnimationFrame(() => {
        setCurrentPage(page);
        reportProgress(page);
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

  // Touch / swipe handlers — RTL: swipe directions are REVERSED
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
          // Swipe left -> PREVIOUS page (RTL reversed)
          goPrev();
        } else {
          // Swipe right -> NEXT page (RTL reversed)
          goNext();
        }
      }
    },
    [goNext, goPrev]
  );

  // Zone tap handlers — RTL: left=next, right=prev
  const handleZoneLeft = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      goNext(); // Left side = next in RTL
    },
    [goNext]
  );

  const handleZoneCenter = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onTap();
    },
    [onTap]
  );

  const handleZoneRight = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      goPrev(); // Right side = prev in RTL
    },
    [goPrev]
  );

  const fitClass = getFitClass(imageFitMode);

  return (
    <div
      className={styles.container}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Touch zones — RTL order: left=next, center, right=prev */}
      <div className={styles.touchLayer}>
        <div className={styles.zoneNext} onClick={handleZoneLeft} />
        <div className={styles.zoneCenter} onClick={handleZoneCenter} />
        <div className={styles.zonePrev} onClick={handleZoneRight} />
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
