"use client";

import { useState } from "react";
import styles from "./BookmarkPopup.module.css";

interface Props {
  x: number;
  y: number;
  onSave: (note: string) => void;
  onCancel: () => void;
}

export default function BookmarkPopup({ x, y, onSave, onCancel }: Props) {
  const [note, setNote] = useState("");

  /* Clamp popup position so it stays within the viewport */
  const popupWidth = 240;
  const popupHeight = 160; // approximate
  const margin = 12;

  const clampedX = Math.min(
    Math.max(margin, x),
    typeof window !== "undefined"
      ? window.innerWidth - popupWidth - margin
      : x
  );
  const clampedY = Math.min(
    Math.max(margin, y),
    typeof window !== "undefined"
      ? window.innerHeight - popupHeight - margin
      : y
  );

  return (
    <>
      {/* Full-screen transparent overlay — click to cancel */}
      <div className={styles.overlay} onClick={onCancel} />

      {/* Popup card positioned near the long-press point */}
      <div
        className={styles.popup}
        style={{ left: clampedX, top: clampedY }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.title}>Set Bookmark</div>

        <input
          className={styles.input}
          type="text"
          maxLength={100}
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave(note);
            if (e.key === "Escape") onCancel();
          }}
        />

        <div className={styles.buttons}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button className={styles.saveBtn} onClick={() => onSave(note)}>
            Save
          </button>
        </div>
      </div>
    </>
  );
}
