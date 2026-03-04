'use client';

import { useEffect, useRef } from 'react';
import styles from './ChapterSlider.module.css';

interface ChapterSliderProps {
  chapters: number[];
  current: number;
  onSelect: (chapter: number) => void;
  onClose: () => void;
  visible: boolean;
}

export default function ChapterSlider({
  chapters,
  current,
  onSelect,
  onClose,
  visible,
}: ChapterSliderProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!visible) return;

    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [visible, onClose]);

  // Close on Escape key
  useEffect(() => {
    if (!visible) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [visible, onClose]);

  // Scroll active chapter into view when opened
  useEffect(() => {
    if (visible && activeRef.current) {
      activeRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <div className={styles.overlay}>
      <div ref={panelRef} className={styles.panel} role="listbox" aria-label="Chapter picker">
        {chapters.map((chapter) => {
          const isActive = chapter === current;
          return (
            <button
              key={chapter}
              ref={isActive ? activeRef : undefined}
              className={`${styles.item} ${isActive ? styles.active : ''}`}
              role="option"
              aria-selected={isActive}
              onClick={() => onSelect(chapter)}
            >
              Chapter {chapter}
            </button>
          );
        })}
      </div>
    </div>
  );
}
