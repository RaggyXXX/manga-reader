"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { ImageFitMode } from "@/lib/types";
import { imageProxyUrl } from "@/lib/scraper";
import styles from "./DoublePageReader.module.css";

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

/**
 * Builds spread pairs: [0,1], [2,3], [4,5], ...
 * If total is odd, the last spread has a single page.
 */
function buildSpreads(total: number): [number, number | null][] {
  const spreads: [number, number | null][] = [];
  for (let i = 0; i < total; i += 2) {
    spreads.push([i, i + 1 < total ? i + 1 : null]);
  }
  return spreads;
}

export default function DoublePageReader({
  imageUrls,
  imageFitMode,
  onCurrentChange,
  onScrollPercentChange,
  onTap,
  nextChapter,
  onNavigateNext,
}: ModeProps) {
  const [currentSpread, setCurrentSpread] = useState(0);
  const [fadeState, setFadeState] = useState<"visible" | "entering">("visible");
  const [pastEnd, setPastEnd] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const total = imageUrls.length;
  const spreads = buildSpreads(total);
  const totalSpreads = spreads.length;

  // Detect narrow viewport for single-page fallback
  useEffect(() => {
    const checkWidth = () => {
      setIsNarrow(window.innerWidth < 768);
    };
    checkWidth();
    window.addEventListener("resize", checkWidth);
    return () => window.removeEventListener("resize", checkWidth);
  }, []);

  // In narrow mode, behave like single-page: spreads are just individual pages
  const effectiveTotalSpreads = isNarrow ? total : totalSpreads;

  const reportProgress = useCallback(
    (spread: number) => {
      if (isNarrow) {
        // In narrow mode, spread index = page index
        onCurrentChange(spread);
        onScrollPercentChange(total > 1 ? (spread / (total - 1)) * 100 : 100);
      } else {
        const leftPage = spreads[spread]?.[0] ?? 0;
        onCurrentChange(leftPage);
        onScrollPercentChange(
          totalSpreads > 1 ? (spread / (totalSpreads - 1)) * 100 : 100
        );
      }
    },
    [isNarrow, onCurrentChange, onScrollPercentChange, total, totalSpreads, spreads]
  );

  const goToSpread = useCallback(
    (spread: number) => {
      if (spread < 0) return;
      if (spread >= effectiveTotalSpreads) {
        setPastEnd(true);
        return;
      }
      setPastEnd(false);
      setFadeState("entering");
      requestAnimationFrame(() => {
        setCurrentSpread(spread);
        reportProgress(spread);
        requestAnimationFrame(() => {
          setFadeState("visible");
        });
      });
    },
    [effectiveTotalSpreads, reportProgress]
  );

  const goNext = useCallback(() => {
    if (pastEnd) {
      if (nextChapter !== null) onNavigateNext();
      return;
    }
    goToSpread(currentSpread + 1);
  }, [currentSpread, pastEnd, nextChapter, onNavigateNext, goToSpread]);

  const goPrev = useCallback(() => {
    if (pastEnd) {
      setPastEnd(false);
      return;
    }
    goToSpread(currentSpread - 1);
  }, [currentSpread, pastEnd, goToSpread]);

  // Report initial state
  useEffect(() => {
    reportProgress(currentSpread);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset when imageUrls change (new chapter)
  useEffect(() => {
    setCurrentSpread(0);
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

      if (Math.abs(dx) > 50 && Math.abs(dy) < 50) {
        if (dx < 0) {
          goNext();
        } else {
          goPrev();
        }
      }
    },
    [goNext, goPrev]
  );

  // Zone tap handlers (split 50/50 for double-page)
  const handleZonePrev = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      goPrev();
    },
    [goPrev]
  );

  const handleZoneNext = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      goNext();
    },
    [goNext]
  );

  const fitClass = getFitClass(imageFitMode);

  // Determine which pages to show
  const renderContent = () => {
    if (pastEnd) {
      return (
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
      );
    }

    // Narrow mode: show single page
    if (isNarrow) {
      const pageIndex = currentSpread; // In narrow mode, spread = page
      return (
        <img
          key={pageIndex}
          src={imageProxyUrl(imageUrls[pageIndex])}
          alt={`Seite ${pageIndex + 1}`}
          className={`${styles.singleImage} ${fitClass}`}
          draggable={false}
        />
      );
    }

    // Wide mode: show spread (1 or 2 pages)
    const spread = spreads[currentSpread];
    if (!spread) return null;

    const [leftIdx, rightIdx] = spread;

    // Single remaining page — show centered
    if (rightIdx === null) {
      return (
        <img
          key={leftIdx}
          src={imageProxyUrl(imageUrls[leftIdx])}
          alt={`Seite ${leftIdx + 1}`}
          className={`${styles.singleImage} ${fitClass}`}
          draggable={false}
        />
      );
    }

    // Two pages side by side
    return (
      <>
        <img
          key={`l-${leftIdx}`}
          src={imageProxyUrl(imageUrls[leftIdx])}
          alt={`Seite ${leftIdx + 1}`}
          className={styles.spreadImage}
          draggable={false}
        />
        <img
          key={`r-${rightIdx}`}
          src={imageProxyUrl(imageUrls[rightIdx])}
          alt={`Seite ${rightIdx + 1}`}
          className={styles.spreadImage}
          draggable={false}
        />
      </>
    );
  };

  // Page counter text
  const getCounterText = () => {
    if (pastEnd) return "";
    if (isNarrow) {
      return `${currentSpread + 1} / ${total}`;
    }
    const spread = spreads[currentSpread];
    if (!spread) return "";
    const [leftIdx, rightIdx] = spread;
    if (rightIdx === null) {
      return `${leftIdx + 1} / ${total}`;
    }
    return `${leftIdx + 1}-${rightIdx + 1} / ${total}`;
  };

  return (
    <div
      className={styles.container}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Touch zones */}
      <div className={styles.touchLayer}>
        <div className={styles.zonePrev} onClick={handleZonePrev} />
        <div className={styles.zoneNext} onClick={handleZoneNext} />
      </div>

      {/* Spread content */}
      <div
        className={`${styles.spreadWrapper} ${
          fadeState === "entering" ? styles.entering : styles.visible
        }`}
      >
        {renderContent()}
      </div>

      {/* Page counter */}
      {!pastEnd && (
        <div className={styles.pageCounter}>{getCounterText()}</div>
      )}
    </div>
  );
}
