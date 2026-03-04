"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import styles from "./Reader.module.css";
import { markChapterRead, saveScrollPosition, getScrollPosition } from "@/lib/reading-progress";
import { imageProxyUrl } from "@/lib/scraper";

interface Props {
  slug: string;
  chapterNumber: number;
  title: string;
  imageUrls: string[];
  prevChapter: number | null;
  nextChapter: number | null;
  onNavigate: (chapter: number) => void;
}

export function Reader({
  slug,
  chapterNumber,
  title,
  imageUrls,
  prevChapter,
  nextChapter,
  onNavigate,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [barsVisible, setBarsVisible] = useState(true);
  const [currentImage, setCurrentImage] = useState(1);
  const lastScrollY = useRef(0);
  const hideTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const imageRefs = useRef<(HTMLImageElement | null)[]>([]);

  // Mark chapter as read
  useEffect(() => {
    markChapterRead(slug, chapterNumber);
  }, [slug, chapterNumber]);

  // Restore scroll position
  useEffect(() => {
    const pos = getScrollPosition(slug, chapterNumber);
    if (pos && containerRef.current) {
      const target = imageRefs.current[pos.imageIndex];
      if (target) {
        setTimeout(() => {
          target.scrollIntoView({ behavior: "instant", block: "start" });
        }, 300);
      }
    }
  }, [slug, chapterNumber]);

  // IntersectionObserver for tracking current image
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.getAttribute("data-index"));
            if (!isNaN(idx)) {
              setCurrentImage(idx + 1);
            }
          }
        }
      },
      { threshold: 0.5 }
    );

    const images = imageRefs.current.filter(Boolean) as HTMLImageElement[];
    images.forEach((img) => observer.observe(img));

    return () => observer.disconnect();
  }, [imageUrls]);

  // Save scroll position (debounced)
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const handleScroll = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (containerRef.current) {
          const scrollTop = containerRef.current.scrollTop;
          const scrollHeight = containerRef.current.scrollHeight;
          const clientHeight = containerRef.current.clientHeight;
          const scrollPercent = scrollHeight > clientHeight
            ? (scrollTop / (scrollHeight - clientHeight)) * 100
            : 0;

          saveScrollPosition(slug, chapterNumber, {
            scrollPercent,
            imageIndex: currentImage - 1,
            timestamp: Date.now(),
          });
        }
      }, 500);
    };

    const container = containerRef.current;
    container?.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container?.removeEventListener("scroll", handleScroll);
      clearTimeout(timeout);
    };
  }, [slug, chapterNumber, currentImage]);

  // Auto-hide bars on scroll
  useEffect(() => {
    const handleScroll = () => {
      const container = containerRef.current;
      if (!container) return;

      const currentY = container.scrollTop;
      if (currentY > lastScrollY.current + 20) {
        setBarsVisible(false);
      } else if (currentY < lastScrollY.current - 20) {
        setBarsVisible(true);
        clearTimeout(hideTimeout.current);
        hideTimeout.current = setTimeout(() => setBarsVisible(false), 3000);
      }
      lastScrollY.current = currentY;
    };

    const container = containerRef.current;
    container?.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container?.removeEventListener("scroll", handleScroll);
      clearTimeout(hideTimeout.current);
    };
  }, []);

  // Tap to toggle bars
  const handleTap = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "BUTTON" || target.tagName === "A") return;
      setBarsVisible((v) => !v);
    },
    []
  );

  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign("/");
  }, []);

  return (
    <div
      ref={containerRef}
      className={styles.container}
      onClick={handleTap}
    >
      {/* Top bar */}
      <div className={`${styles.topBar} ${barsVisible ? "" : styles.hidden}`}>
        <button className={styles.backBtn} onClick={handleBack} aria-label="Go back">
          &#8250;
        </button>
        <span className={styles.topTitle}>
          Ch. {chapterNumber}
        </span>
        <span className={styles.pageIndicator}>
          {currentImage}/{imageUrls.length}
        </span>
      </div>

      {/* Images */}
      <div className={styles.imageContainer}>
        {imageUrls.map((url, i) => (
          <img
            key={i}
            ref={(el) => { imageRefs.current[i] = el; }}
            data-index={i}
            src={imageProxyUrl(url)}
            alt={`Page ${i + 1}`}
            className={styles.image}
            loading={i < 3 ? "eager" : "lazy"}
            referrerPolicy="no-referrer"
          />
        ))}

        {/* Next chapter banner */}
        <div className={styles.endBanner}>
          {nextChapter ? (
            <button
              className={styles.nextBtn}
              onClick={(e) => {
                e.stopPropagation();
                onNavigate(nextChapter);
              }}
            >
              Next chapter ({nextChapter}) &rarr;
            </button>
          ) : (
            <p className={styles.endText}>End of series</p>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className={`${styles.bottomBar} ${barsVisible ? "" : styles.hidden}`}>
        <button
          className={styles.navBtn}
          disabled={!prevChapter}
          onClick={(e) => {
            e.stopPropagation();
            if (prevChapter) onNavigate(prevChapter);
          }}
        >
          &larr; Previous
        </button>
        <span className={styles.chapterLabel}>
          {currentImage} / {imageUrls.length}
        </span>
        <button
          className={styles.navBtn}
          disabled={!nextChapter}
          onClick={(e) => {
            e.stopPropagation();
            if (nextChapter) onNavigate(nextChapter);
          }}
        >
          Next &rarr;
        </button>
      </div>
    </div>
  );
}
