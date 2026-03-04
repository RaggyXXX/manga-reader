"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { ImageFitMode } from "@/lib/types";
import { imageProxyUrl } from "@/lib/scraper";
import { detectPanels } from "@/lib/panel-detector";
import type { PanelRect } from "@/lib/panel-detector";
import styles from "./PanelReader.module.css";

interface ModeProps {
  imageUrls: string[];
  imageFitMode: ImageFitMode;
  onCurrentChange: (index: number) => void;
  onScrollPercentChange: (percent: number) => void;
  onTap: () => void;
  nextChapter: number | null;
  onNavigateNext: () => void;
}

export default function PanelReader({
  imageUrls,
  imageFitMode: _imageFitMode,
  onCurrentChange,
  onScrollPercentChange,
  onTap,
  nextChapter,
  onNavigateNext,
}: ModeProps) {
  const [currentImageIdx, setCurrentImageIdx] = useState(0);
  const [currentPanelIdx, setCurrentPanelIdx] = useState(0);
  const [panels, setPanels] = useState<PanelRect[]>([]);
  const [loading, setLoading] = useState(true);
  const [imageDimensions, setImageDimensions] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });
  const [pastEnd, setPastEnd] = useState(false);

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Panels detected per image — cached to avoid re-detection when going back
  const panelCacheRef = useRef<
    Map<number, { panels: PanelRect[]; width: number; height: number }>
  >(new Map());

  const total = imageUrls.length;

  // --------------------------------------------------------------------------
  // Progress reporting
  // --------------------------------------------------------------------------

  const reportProgress = useCallback(
    (imgIdx: number, panelIdx: number, panelCount: number) => {
      onCurrentChange(imgIdx);

      // Compute total progress: each image contributes equally, panels
      // subdivide each image's portion.
      if (total === 0) {
        onScrollPercentChange(0);
        return;
      }
      const imageWeight = 100 / total;
      const basePercent = imgIdx * imageWeight;
      const panelFraction =
        panelCount > 1 ? panelIdx / (panelCount - 1) : 1;
      const percent = basePercent + panelFraction * imageWeight;
      onScrollPercentChange(Math.min(percent, 100));
    },
    [onCurrentChange, onScrollPercentChange, total]
  );

  // --------------------------------------------------------------------------
  // Panel detection — runs when currentImageIdx changes
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (total === 0) return;
    if (pastEnd) return;

    let cancelled = false;

    const cached = panelCacheRef.current.get(currentImageIdx);
    if (cached) {
      setPanels(cached.panels);
      setImageDimensions({ width: cached.width, height: cached.height });
      setLoading(false);
      return;
    }

    setLoading(true);
    const proxyUrl = imageProxyUrl(imageUrls[currentImageIdx]);

    detectPanels(proxyUrl, false).then((result) => {
      if (cancelled) return;

      // Get image dimensions from the panel result — if hasPanels is false,
      // the single panel covers the whole image.
      const allPanels = result.panels;
      let imgW = 0;
      let imgH = 0;
      if (allPanels.length > 0) {
        // The full-image fallback panel gives us dimensions directly
        for (const p of allPanels) {
          imgW = Math.max(imgW, p.x + p.width);
          imgH = Math.max(imgH, p.y + p.height);
        }
      }

      panelCacheRef.current.set(currentImageIdx, {
        panels: allPanels,
        width: imgW,
        height: imgH,
      });

      setPanels(allPanels);
      setImageDimensions({ width: imgW, height: imgH });
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [currentImageIdx, imageUrls, total, pastEnd]);

  // Report progress when panel changes
  useEffect(() => {
    if (!loading && panels.length > 0) {
      reportProgress(currentImageIdx, currentPanelIdx, panels.length);
    }
  }, [currentImageIdx, currentPanelIdx, panels, loading, reportProgress]);

  // --------------------------------------------------------------------------
  // Reset when chapter changes (new imageUrls)
  // --------------------------------------------------------------------------

  useEffect(() => {
    setCurrentImageIdx(0);
    setCurrentPanelIdx(0);
    setPastEnd(false);
    setLoading(true);
    panelCacheRef.current.clear();
  }, [imageUrls]);

  // --------------------------------------------------------------------------
  // Navigation
  // --------------------------------------------------------------------------

  const goNext = useCallback(() => {
    if (pastEnd) {
      if (nextChapter !== null) onNavigateNext();
      return;
    }

    if (currentPanelIdx < panels.length - 1) {
      // Next panel in current image
      setCurrentPanelIdx((prev) => prev + 1);
    } else if (currentImageIdx < total - 1) {
      // Next image, reset to first panel
      setCurrentImageIdx((prev) => prev + 1);
      setCurrentPanelIdx(0);
    } else {
      // Past the last panel of the last image
      setPastEnd(true);
    }
  }, [
    pastEnd,
    currentPanelIdx,
    currentImageIdx,
    panels.length,
    total,
    nextChapter,
    onNavigateNext,
  ]);

  const goPrev = useCallback(() => {
    if (pastEnd) {
      setPastEnd(false);
      return;
    }

    if (currentPanelIdx > 0) {
      // Previous panel in current image
      setCurrentPanelIdx((prev) => prev - 1);
    } else if (currentImageIdx > 0) {
      // Previous image — go to its last panel
      const prevImgIdx = currentImageIdx - 1;
      const cached = panelCacheRef.current.get(prevImgIdx);
      setCurrentImageIdx(prevImgIdx);
      // If we have cached panels for the previous image, jump to the last
      if (cached && cached.panels.length > 0) {
        setCurrentPanelIdx(cached.panels.length - 1);
      } else {
        // Will be corrected once detection finishes (effect below)
        setCurrentPanelIdx(0);
      }
    }
    // else: at the very beginning, do nothing
  }, [pastEnd, currentPanelIdx, currentImageIdx]);

  // When navigating backward to a new image, once panels load, jump to last
  // panel if currentPanelIdx was set to 0 as a placeholder but we expect last.
  // We track this via a ref.
  const wantLastPanelRef = useRef(false);

  const goPrevWithLastPanel = useCallback(() => {
    if (pastEnd) {
      setPastEnd(false);
      return;
    }

    if (currentPanelIdx > 0) {
      setCurrentPanelIdx((prev) => prev - 1);
    } else if (currentImageIdx > 0) {
      const prevImgIdx = currentImageIdx - 1;
      const cached = panelCacheRef.current.get(prevImgIdx);
      setCurrentImageIdx(prevImgIdx);
      if (cached && cached.panels.length > 0) {
        setCurrentPanelIdx(cached.panels.length - 1);
      } else {
        wantLastPanelRef.current = true;
        setCurrentPanelIdx(0);
      }
    }
  }, [pastEnd, currentPanelIdx, currentImageIdx]);

  // If we wanted the last panel and panels just loaded, jump to it
  useEffect(() => {
    if (wantLastPanelRef.current && !loading && panels.length > 0) {
      wantLastPanelRef.current = false;
      setCurrentPanelIdx(panels.length - 1);
    }
  }, [loading, panels]);

  // --------------------------------------------------------------------------
  // Touch / swipe handlers (same pattern as PageReader)
  // --------------------------------------------------------------------------

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
          // Swipe left -> next
          goNext();
        } else {
          // Swipe right -> previous
          goPrevWithLastPanel();
        }
      }
    },
    [goNext, goPrevWithLastPanel]
  );

  // --------------------------------------------------------------------------
  // Zone tap handlers
  // --------------------------------------------------------------------------

  const handleZonePrev = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      goPrevWithLastPanel();
    },
    [goPrevWithLastPanel]
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

  // --------------------------------------------------------------------------
  // Compute transform for current panel
  // --------------------------------------------------------------------------

  const currentPanel: PanelRect | null =
    panels.length > 0 && currentPanelIdx < panels.length
      ? panels[currentPanelIdx]
      : null;

  let transform = "";
  if (currentPanel && containerRef.current) {
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    const scaleX = containerWidth / currentPanel.width;
    const scaleY = containerHeight / currentPanel.height;
    const scale = Math.min(scaleX, scaleY);
    transform = `scale(${scale}) translate(${-currentPanel.x}px, ${-currentPanel.y}px)`;
  }

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  // Loading state
  if (loading && !pastEnd) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Detecting panels...</div>
      </div>
    );
  }

  // End-of-chapter banner
  if (pastEnd) {
    return (
      <div
        className={styles.container}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className={styles.touchLayer}>
          <div className={styles.zonePrev} onClick={handleZonePrev} />
          <div className={styles.zoneCenter} onClick={handleZoneCenter} />
          <div className={styles.zoneNext} onClick={handleZoneNext} />
        </div>
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
      </div>
    );
  }

  // Panel view
  return (
    <div
      className={styles.container}
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Touch zones */}
      <div className={styles.touchLayer}>
        <div className={styles.zonePrev} onClick={handleZonePrev} />
        <div className={styles.zoneCenter} onClick={handleZoneCenter} />
        <div className={styles.zoneNext} onClick={handleZoneNext} />
      </div>

      {/* Panel viewport */}
      <div className={styles.panelViewport}>
        <img
          key={`${currentImageIdx}-${currentPanelIdx}`}
          src={imageProxyUrl(imageUrls[currentImageIdx])}
          alt={`Page ${currentImageIdx + 1}, Panel ${currentPanelIdx + 1}`}
          className={styles.panelImage}
          style={{
            width: imageDimensions.width || "auto",
            height: imageDimensions.height || "auto",
            transform,
          }}
          draggable={false}
          referrerPolicy="no-referrer"
        />
      </div>

      {/* Panel counter */}
      <div className={styles.panelCounter}>
        {currentImageIdx + 1}/{total} &middot; Panel {currentPanelIdx + 1}/
        {panels.length}
      </div>
    </div>
  );
}
