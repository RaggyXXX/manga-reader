"use client";

import { useEffect, useRef, useCallback } from "react";
import styles from "./VerticalReader.module.css";
import type { ImageFitMode } from "@/lib/types";
import { imageProxyUrl } from "@/lib/scraper";

/* ── Fit-mode → CSS class map ────────────────────── */

const FIT_CLASS: Record<ImageFitMode, string> = {
  "fit-width": styles.fitWidth,
  "fit-height": styles.fitHeight,
  original: styles.fitOriginal,
  "fit-screen": styles.fitScreen,
};

/* ── Props ──────────────────────────────────────────── */

interface VerticalReaderProps {
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

/* ── Component ──────────────────────────────────────── */

export default function VerticalReader({
  imageUrls,
  imageFitMode,
  onCurrentChange,
  onScrollPercentChange,
  onTap,
  nextChapter,
  onNavigateNext,
  onLongPressImage,
  bookmarkedIndices,
}: VerticalReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRefs = useRef<(HTMLImageElement | null)[]>([]);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressMovedRef = useRef(false);

  /* ── Long-press handlers for bookmark ──────────── */

  const handleImagePointerDown = useCallback((index: number, e: React.PointerEvent) => {
    if (!onLongPressImage) return;
    longPressMovedRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      if (!longPressMovedRef.current) {
        onLongPressImage(index, e.clientX, e.clientY);
      }
    }, 600);
  }, [onLongPressImage]);

  const handleImagePointerMove = useCallback(() => {
    longPressMovedRef.current = true;
  }, []);

  const handleImagePointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  /* ── IntersectionObserver: track which image is visible ── */

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.getAttribute("data-index"));
            if (!isNaN(idx)) {
              onCurrentChange(idx);
            }
          }
        }
      },
      { threshold: 0.5 }
    );

    const images = imageRefs.current.filter(Boolean) as HTMLImageElement[];
    images.forEach((img) => observer.observe(img));

    return () => observer.disconnect();
  }, [imageUrls, onCurrentChange]);

  /* ── Debounced scroll handler: report scroll % ── */

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    const handleScroll = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        const container = containerRef.current;
        if (!container) return;

        const { scrollTop, scrollHeight, clientHeight } = container;
        const percent =
          scrollHeight > clientHeight
            ? (scrollTop / (scrollHeight - clientHeight)) * 100
            : 0;

        onScrollPercentChange(percent);
      }, 300);
    };

    const container = containerRef.current;
    container?.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      container?.removeEventListener("scroll", handleScroll);
      clearTimeout(timeout);
    };
  }, [onScrollPercentChange]);

  /* ── Tap handler (toggle bars) ─────────────────── */

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      // Ignore clicks on buttons / links so navigation still works
      if (
        target.tagName === "BUTTON" ||
        target.tagName === "A" ||
        target.closest("button") ||
        target.closest("a")
      ) {
        return;
      }
      onTap();
    },
    [onTap]
  );

  /* ── Ref callback for image elements ───────────── */

  const setImageRef = useCallback(
    (el: HTMLImageElement | null, index: number) => {
      imageRefs.current[index] = el;
    },
    []
  );

  /* ── Derived ───────────────────────────────────── */

  const fitClass = FIT_CLASS[imageFitMode] ?? FIT_CLASS["fit-width"];

  return (
    <div
      ref={containerRef}
      className={styles.scrollContainer}
      onClick={handleClick}
    >
      <div className={styles.imageList}>
        {imageUrls.map((url, i) => (
          <div
            key={`${url}-${i}`}
            style={{ position: 'relative' }}
            onPointerDown={(e) => handleImagePointerDown(i, e)}
            onPointerMove={handleImagePointerMove}
            onPointerUp={handleImagePointerUp}
            onPointerCancel={handleImagePointerUp}
          >
            <img
              ref={(el) => setImageRef(el, i)}
              data-index={i}
              src={imageProxyUrl(url)}
              alt={`Page ${i + 1}`}
              className={`${styles.image} ${fitClass}`}
              loading={i < 3 ? "eager" : "lazy"}
              draggable={false}
              referrerPolicy="no-referrer"
            />
            {bookmarkedIndices?.has(i) && (
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
          </div>
        ))}

        {/* Next chapter banner */}
        <div className={styles.endBanner}>
          {nextChapter != null ? (
            <button
              className={styles.nextBtn}
              onClick={(e) => {
                e.stopPropagation();
                onNavigateNext();
              }}
            >
              Next chapter ({nextChapter}) &#8594;
            </button>
          ) : (
            <p className={styles.endText}>End of series</p>
          )}
        </div>
      </div>
    </div>
  );
}
