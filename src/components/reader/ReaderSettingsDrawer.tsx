'use client';

import { useCallback, useEffect } from 'react';
import type {
  ReaderSettings,
  ReadingMode,
  ImageFitMode,
  ReaderBackground,
} from '@/lib/types';
import styles from './ReaderSettingsDrawer.module.css';

interface Props {
  settings: ReaderSettings;
  onSettingsChange: (settings: ReaderSettings) => void;
  onClose: () => void;
  visible: boolean;
}

/* ── Inline SVG icons for reading modes ──────── */

function IconVertical() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="1" width="8" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="4" y="6" width="8" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="4" y="11" width="8" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconPage() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="1" width="10" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconRtl() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="2" width="9" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 8L2 5.5V10.5L5 8Z" fill="currentColor" />
    </svg>
  );
}

function IconDouble() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="2" width="6" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="2" width="6" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/* ── Inline SVG icons for brightness ─────────── */

function IconSunDim() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconSunBright() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="9" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="9" y1="1" x2="9" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="9" y1="15" x2="9" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="1" y1="9" x2="3" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="15" y1="9" x2="17" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="3.34" y1="3.34" x2="4.76" y2="4.76" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="13.24" y1="13.24" x2="14.66" y2="14.66" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="3.34" y1="14.66" x2="4.76" y2="13.24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="13.24" y1="4.76" x2="14.66" y2="3.34" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function ReaderSettingsDrawer({
  settings,
  onSettingsChange,
  onClose,
  visible,
}: Props) {
  /* ── Helpers ───────────────────────────────── */

  const update = useCallback(
    <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => {
      onSettingsChange({ ...settings, [key]: value });
    },
    [settings, onSettingsChange],
  );

  const applyPreset = useCallback(
    (preset: "cozy-day" | "night-read") => {
      if (preset === "cozy-day") {
        onSettingsChange({
          ...settings,
          background: "sepia",
          brightness: 1.05,
          imageFitMode: "fit-width",
        });
        return;
      }

      onSettingsChange({
        ...settings,
        background: "dark",
        brightness: 0.85,
        imageFitMode: "fit-width",
      });
    },
    [onSettingsChange, settings],
  );

  /* ── Close on Escape ───────────────────────── */

  useEffect(() => {
    if (!visible) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [visible, onClose]);

  /* ── Reading mode definitions ──────────────── */

  const readingModes: { value: ReadingMode; label: string; icon: React.ReactNode }[] = [
    { value: 'vertical', label: 'Vertikal', icon: <IconVertical /> },
    { value: 'page', label: 'Seite', icon: <IconPage /> },
    { value: 'rtl', label: 'RTL', icon: <IconRtl /> },
    { value: 'double-page', label: 'Doppel', icon: <IconDouble /> },
  ];

  /* ── Background presets ────────────────────── */

  const bgPresets: { value: ReaderBackground; cls: string }[] = [
    { value: 'black', cls: styles.bgBlack },
    { value: 'dark', cls: styles.bgDark },
    { value: 'sepia', cls: styles.bgSepia },
    { value: 'white', cls: styles.bgWhite },
  ];

  /* ── Image fit presets ─────────────────────── */

  const fitModes: { value: ImageFitMode; label: string }[] = [
    { value: 'fit-width', label: 'Breite' },
    { value: 'fit-height', label: 'Hoehe' },
    { value: 'original', label: 'Original' },
    { value: 'fit-screen', label: 'Einpassen' },
  ];

  /* ── Render ────────────────────────────────── */

  return (
    <>
      {/* Backdrop */}
      <div
        className={`${styles.backdrop} ${visible ? styles.visible : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={`${styles.drawer} ${visible ? styles.visible : ''}`}
        role="dialog"
        aria-label="Leser-Einstellungen"
        aria-modal="true"
      >
        {/* Drag handle (decorative) */}
        <div className={styles.dragHandle}>
          <div className={styles.dragPill} />
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>Presets</div>
          <div className={styles.pillRow}>
            <button className={styles.pill} onClick={() => applyPreset("cozy-day")} type="button">
              Cozy Day
            </button>
            <button className={styles.pill} onClick={() => applyPreset("night-read")} type="button">
              Night Read
            </button>
          </div>
        </div>

        {/* ── Section 1: Lesemodus ─────────────── */}
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Lesemodus</div>
          <div className={styles.modeRow}>
            {readingModes.map((mode) => (
              <button
                key={mode.value}
                className={`${styles.modeBtn} ${
                  settings.readingMode === mode.value ? styles.active : ''
                }`}
                onClick={() => update('readingMode', mode.value)}
                aria-pressed={settings.readingMode === mode.value}
                type="button"
              >
                <span className={styles.modeIcon}>{mode.icon}</span>
                <span className={styles.modeLabel}>{mode.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Section 2: Anzeige ───────────────── */}
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Anzeige</div>

          {/* Helligkeit */}
          <div className={styles.subSection}>
            <div className={styles.subLabel}>Helligkeit</div>
            <div className={styles.sliderRow}>
              <span className={styles.sliderIcon}>
                <IconSunDim />
              </span>
              <input
                type="range"
                className={styles.slider}
                min={0.2}
                max={1.5}
                step={0.05}
                value={settings.brightness}
                onChange={(e) => update('brightness', parseFloat(e.target.value))}
                aria-label="Helligkeit"
              />
              <span className={styles.sliderIcon}>
                <IconSunBright />
              </span>
            </div>
          </div>

          {/* Hintergrund */}
          <div className={styles.subSection}>
            <div className={styles.subLabel}>Hintergrund</div>
            <div className={styles.bgRow}>
              {bgPresets.map((bg) => (
                <button
                  key={bg.value}
                  className={`${styles.bgCircle} ${bg.cls} ${
                    settings.background === bg.value ? styles.active : ''
                  }`}
                  onClick={() => update('background', bg.value)}
                  aria-label={`Hintergrund: ${bg.value}`}
                  aria-pressed={settings.background === bg.value}
                  type="button"
                />
              ))}
            </div>
          </div>

          {/* Bildanpassung */}
          <div className={styles.subSection}>
            <div className={styles.subLabel}>Bildanpassung</div>
            <div className={styles.pillRow}>
              {fitModes.map((fit) => (
                <button
                  key={fit.value}
                  className={`${styles.pill} ${
                    settings.imageFitMode === fit.value ? styles.active : ''
                  }`}
                  onClick={() => update('imageFitMode', fit.value)}
                  aria-pressed={settings.imageFitMode === fit.value}
                  type="button"
                >
                  {fit.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Section 3: Auto-Scroll (only in vertical mode) */}
        {settings.readingMode === 'vertical' && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Auto-Scroll</div>

            {/* Auto-Scroll toggle */}
            <div className={styles.toggleRow}>
              <span className={styles.toggleLabel}>Auto-Scroll</span>
              <button
                className={`${styles.toggle} ${settings.autoScroll ? styles.on : ''}`}
                onClick={() => update('autoScroll', !settings.autoScroll)}
                role="switch"
                aria-checked={settings.autoScroll}
                type="button"
              >
                <span className={styles.toggleKnob} />
              </button>
            </div>

            {/* Speed slider (only when auto-scroll enabled) */}
            {settings.autoScroll && (
              <div className={styles.speedSection}>
                <div className={styles.sliderLabel}>Geschwindigkeit</div>
                <div className={styles.sliderRow}>
                  <span className={styles.sliderIcon} aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <ellipse cx="8" cy="10" rx="6" ry="4.5" stroke="currentColor" strokeWidth="1.3" />
                      <circle cx="6" cy="9" r="1" fill="currentColor" />
                      <circle cx="10" cy="9" r="1" fill="currentColor" />
                      <path d="M6.5 11.5Q8 12.5 9.5 11.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                      <path d="M5 6.5Q6.5 4 8 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                      <path d="M11 6.5Q9.5 4 8 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                  </span>
                  <input
                    type="range"
                    className={styles.slider}
                    min={20}
                    max={200}
                    step={10}
                    value={settings.autoScrollSpeed}
                    onChange={(e) => update('autoScrollSpeed', parseInt(e.target.value, 10))}
                    aria-label="Auto-Scroll Geschwindigkeit"
                  />
                  <span className={styles.sliderIcon} aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <ellipse cx="7" cy="9" rx="5" ry="5" stroke="currentColor" strokeWidth="1.3" />
                      <circle cx="5.5" cy="7.5" r="1" fill="currentColor" />
                      <circle cx="8.5" cy="7.5" r="1" fill="currentColor" />
                      <path d="M5 10Q7 12 9 10" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                      <path d="M11 5.5L14 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      <path d="M11 8.5L14 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      <path d="M3 3L5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                      <path d="M4 9L2 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    </svg>
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Section 4: Extras ────────────────── */}
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Extras</div>

          <div className={styles.toggleRow}>
            <span className={styles.toggleLabel}>Fortschrittsleiste</span>
            <button
              className={`${styles.toggle} ${settings.showProgressBar ? styles.on : ''}`}
              onClick={() => update('showProgressBar', !settings.showProgressBar)}
              role="switch"
              aria-checked={settings.showProgressBar}
              type="button"
            >
              <span className={styles.toggleKnob} />
            </button>
          </div>

          <div className={styles.toggleRow}>
            <span className={styles.toggleLabel}>Naechstes Kapitel vorladen</span>
            <button
              className={`${styles.toggle} ${settings.preloadNextChapter ? styles.on : ''}`}
              onClick={() => update('preloadNextChapter', !settings.preloadNextChapter)}
              role="switch"
              aria-checked={settings.preloadNextChapter}
              type="button"
            >
              <span className={styles.toggleKnob} />
            </button>
          </div>

          <div className={styles.toggleRow}>
            <span className={styles.toggleLabel}>Doppel-Tap Zoom</span>
            <button
              className={`${styles.toggle} ${settings.doubleTapZoom ? styles.on : ''}`}
              onClick={() => update('doubleTapZoom', !settings.doubleTapZoom)}
              role="switch"
              aria-checked={settings.doubleTapZoom}
              type="button"
            >
              <span className={styles.toggleKnob} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
