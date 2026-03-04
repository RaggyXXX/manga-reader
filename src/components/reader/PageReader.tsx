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
  onLongPressImage?: (imageIndex: number, x: number, y: number) => void;
  bookmarkedIndices?: Set<number>;
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
  onLongPressImage,
  bookmarkedIndices,
}: ModeProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [fadeState, setFadeState] = useState<"visible" | "entering">("visible");
  const [pastEnd, setPastEnd] = useState(false);

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressMovedRef = useRef(false);
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

  // Long-press handlers for bookmark
  const handleImagePointerDown = useCallback((e: React.PointerEvent) => {
    if (!onLongPressImage) return;
    longPressMovedRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      if (!longPressMovedRef.current) {
        onLongPressImage(currentPage, e.clientX, e.clientY);
      }
    }, 600);
  }, [onLongPressImage, currentPage]);

  const handleImagePointerMove = useCallback(() => {
    longPressMovedRef.current = true;
  }, []);

  const handleImagePointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

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
      <div
        className={styles.imageWrapper}
        onPointerDown={handleImagePointerDown}
        onPointerMove={handleImagePointerMove}
        onPointerUp={handleImagePointerUp}
        onPointerCancel={handleImagePointerUp}
      >
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
                Next chapter ({nextChapter}) &rarr;
              </button>
            ) : (
              <p className={styles.endText}>End of series</p>
            )}
          </div>
        ) : (
          <>
            <img
              key={currentPage}
              src={imageProxyUrl(imageUrls[currentPage])}
              alt={`Page ${currentPage + 1}`}
              className={`${styles.pageImage} ${fitClass} ${
                fadeState === "entering" ? styles.entering : styles.visible
              }`}
              draggable={false}
              referrerPolicy="no-referrer"
            />
            {bookmarkedIndices?.has(currentPage) && (
              <div style={{
                position: 'absolute', top: 8, right: 8,
                background: 'rgba(0,0,0,0.6)', borderRadius: '50%',
                width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--primary, #b57f44)" stroke="none">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
            )}
          </>
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
