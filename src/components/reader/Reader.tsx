"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import styles from "./Reader.module.css";
import { getReaderSettings, saveReaderSettings } from "@/lib/reader-settings";
import { markChapterRead } from "@/lib/reading-progress";
import type { ReaderSettings, ImageFitMode } from "@/lib/types";
import { useReaderKeyboard } from "./useReaderKeyboard";
import ProgressBar from "./ProgressBar";
import ChapterSlider from "./ChapterSlider";
import ReaderSettingsDrawer from "./ReaderSettingsDrawer";
import VerticalReader from "./VerticalReader";
import PageReader from "./PageReader";
import RtlReader from "./RtlReader";
import DoublePageReader from "./DoublePageReader";
import { motionOrInstant } from "@/lib/motion";

/* ── Background colour map ─────────────────────────── */

const BACKGROUND_COLORS: Record<string, string> = {
  black: "#000000",
  dark: "#1a1612",
  sepia: "#f4ecd8",
  white: "#ffffff",
};

/* ── Props ──────────────────────────────────────────── */

export interface ReaderProps {
  slug: string;
  chapterNumber: number;
  title: string;
  imageUrls: string[];
  prevChapter: number | null;
  nextChapter: number | null;
  allChapterNums: number[];
  onNavigate: (chapter: number) => void;
}

export interface ModeProps {
  imageUrls: string[];
  imageFitMode: ImageFitMode;
  onCurrentChange: (index: number) => void;
  onScrollPercentChange: (percent: number) => void;
  onTap: () => void;
  nextChapter: number | null;
  onNavigateNext: () => void;
}

/* ── Component ──────────────────────────────────────── */

export default function Reader({
  slug,
  chapterNumber,
  title,
  imageUrls,
  prevChapter,
  nextChapter,
  allChapterNums,
  onNavigate,
}: ReaderProps) {
  const reduced = useReducedMotion();
  /* ── State ─────────────────────────────────────── */

  const [settings, setSettings] = useState<ReaderSettings>(getReaderSettings);
  const [barsVisible, setBarsVisible] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [scrollPercent, setScrollPercent] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chapterSliderOpen, setChapterSliderOpen] = useState(false);

  const hideTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  /* ── Persist settings ──────────────────────────── */

  const updateSettings = useCallback((next: ReaderSettings) => {
    setSettings(next);
    saveReaderSettings(next);
  }, []);

  /* ── Mark chapter read on mount ────────────────── */

  useEffect(() => {
    markChapterRead(slug, chapterNumber);
  }, [slug, chapterNumber]);

  /* ── Auto-hide bars after idle ─────────────────── */

  const scheduleBarsHide = useCallback(() => {
    clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(() => {
      setBarsVisible(false);
    }, 3500);
  }, []);

  useEffect(() => {
    if (barsVisible) {
      scheduleBarsHide();
    }
    return () => clearTimeout(hideTimeout.current);
  }, [barsVisible, scheduleBarsHide]);

  /* ── Callbacks for mode components ─────────────── */

  const handleCurrentChange = useCallback((index: number) => {
    setCurrentPage(index);
  }, []);

  const handleScrollPercentChange = useCallback((percent: number) => {
    setScrollPercent(percent);
  }, []);

  const handleTap = useCallback(() => {
    setBarsVisible((v) => !v);
  }, []);

  const handleNavigateNext = useCallback(() => {
    if (nextChapter != null) {
      onNavigate(nextChapter);
    }
  }, [nextChapter, onNavigate]);

  const handleBack = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
      window.location.assign("/");
    },
    [],
  );

  /* ── Keyboard shortcuts ────────────────────────── */

  useReaderKeyboard({
    nextPage: () => {
      /* Scrolling / page turn is handled inside each mode component */
    },
    prevPage: () => {},
    toggleFullscreen: () => {},
    toggleSettings: () => setSettingsOpen((v) => !v),
    toggleBars: () => setBarsVisible((v) => !v),
  });

  /* ── Chapter navigation helpers ────────────────── */

  const goToPrev = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (prevChapter != null) onNavigate(prevChapter);
    },
    [prevChapter, onNavigate]
  );

  const goToNext = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (nextChapter != null) onNavigate(nextChapter);
    },
    [nextChapter, onNavigate]
  );

  /* ── Render active reading mode ────────────────── */

  const modeProps: ModeProps = {
    imageUrls,
    imageFitMode: settings.imageFitMode,
    onCurrentChange: handleCurrentChange,
    onScrollPercentChange: handleScrollPercentChange,
    onTap: handleTap,
    nextChapter,
    onNavigateNext: handleNavigateNext,
  };

  let modeElement: React.ReactNode;

  switch (settings.readingMode) {
    case "vertical":
      modeElement = <VerticalReader {...modeProps} />;
      break;
    case "page":
      modeElement = <PageReader {...modeProps} />;
      break;
    case "rtl":
      modeElement = <RtlReader {...modeProps} />;
      break;
    case "double-page":
      modeElement = <DoublePageReader {...modeProps} />;
      break;
    default:
      modeElement = <VerticalReader {...modeProps} />;
  }

  /* ── Computed values ───────────────────────────── */

  const bgColor = BACKGROUND_COLORS[settings.background] ?? "#000000";
  const progressPercent = imageUrls.length > 1 ? scrollPercent : 0;

  return (
    <div className={styles.container}>
      {/* Brightness filter wrapper */}
      <div
        className={styles.brightnessWrap}
        style={{ filter: `brightness(${settings.brightness})` }}
      >
        {/* Background layer */}
        <div
          className={styles.background}
          style={{ background: bgColor }}
        />

        {/* Active reading mode */}
        {modeElement}
      </div>

      {/* Progress bar */}
      <ProgressBar
        percent={progressPercent}
        visible={settings.showProgressBar}
      />

      {/* Top bar */}
      <motion.div
        className={`${styles.topBar} ${barsVisible ? "" : styles.hidden}`}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: barsVisible ? 1 : 0, y: barsVisible ? 0 : -8 }}
        transition={motionOrInstant(!!reduced, 0.2)}
      >
        <span
          className={styles.topTitle}
          onClick={(e) => {
            e.stopPropagation();
            setChapterSliderOpen((v) => !v);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setChapterSliderOpen((v) => !v);
            }
          }}
        >
          Ch. {chapterNumber} &mdash; {title}
        </span>

        <span className={styles.pageIndicator}>
          {currentPage + 1}/{imageUrls.length}
        </span>

        <button className={styles.backBtn} onClick={handleBack} aria-label="Go back">
          &#8250;
        </button>

        <button
          className={styles.settingsBtn}
          onClick={(e) => {
            e.stopPropagation();
            setSettingsOpen((v) => !v);
          }}
          aria-label="Settings"
        >
          &#9881;
        </button>
      </motion.div>

      {/* Bottom bar */}
      <motion.div
        className={`${styles.bottomBar} ${barsVisible ? "" : styles.hidden}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: barsVisible ? 1 : 0, y: barsVisible ? 0 : 8 }}
        transition={motionOrInstant(!!reduced, 0.2)}
      >
        <button
          className={styles.navBtn}
          disabled={prevChapter == null}
          onClick={goToPrev}
        >
          &#8592; Previous
        </button>

        <span className={styles.chapterLabel}>
          {currentPage + 1} / {imageUrls.length}
        </span>

        <button
          className={styles.navBtn}
          disabled={nextChapter == null}
          onClick={goToNext}
        >
          Next &#8594;
        </button>
      </motion.div>

      {/* Chapter slider overlay */}
      <ChapterSlider
        chapters={allChapterNums}
        current={chapterNumber}
        onSelect={(ch) => {
          setChapterSliderOpen(false);
          if (ch !== chapterNumber) onNavigate(ch);
        }}
        onClose={() => setChapterSliderOpen(false)}
        visible={chapterSliderOpen}
      />

      {/* Settings drawer */}
      <ReaderSettingsDrawer
        settings={settings}
        onSettingsChange={updateSettings}
        onClose={() => setSettingsOpen(false)}
        visible={settingsOpen}
      />
    </div>
  );
}
