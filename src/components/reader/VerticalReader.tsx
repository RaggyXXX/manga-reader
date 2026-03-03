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
}: VerticalReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRefs = useRef<(HTMLImageElement | null)[]>([]);

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
          <img
            key={`${url}-${i}`}
            ref={(el) => setImageRef(el, i)}
            data-index={i}
            src={imageProxyUrl(url)}
            alt={`Seite ${i + 1}`}
            className={`${styles.image} ${fitClass}`}
            loading={i < 3 ? "eager" : "lazy"}
            draggable={false}
          />
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
              Naechstes Kapitel ({nextChapter}) &#8594;
            </button>
          ) : (
            <p className={styles.endText}>Ende der Serie</p>
          )}
        </div>
      </div>
    </div>
  );
}
