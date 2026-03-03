"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteSeries } from "@/lib/manga-store";
import { clearSeriesProgress } from "@/lib/reading-progress";
import styles from "./page.module.css";

interface Props {
  seriesSlug: string;
  seriesTitle: string;
}

export function DeleteSeriesButton({ seriesSlug, seriesTitle }: Props) {
  const [showDialog, setShowDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    setDeleting(true);
    deleteSeries(seriesSlug);
    clearSeriesProgress(seriesSlug);
    router.push("/");
  };

  return (
    <>
      <button
        className={styles.deleteBtn}
        onClick={() => setShowDialog(true)}
        type="button"
      >
        Serie entfernen
      </button>

      {showDialog && (
        <div className={styles.dialogOverlay} onClick={() => setShowDialog(false)}>
          <div className={styles.dialogBox} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.dialogTitle}>Serie entfernen?</h3>
            <p className={styles.dialogText}>
              &laquo;{seriesTitle}&raquo; und alle zugehoerigen Kapitel werden
              unwiderruflich geloescht.
            </p>
            <div className={styles.dialogActions}>
              <button
                className={styles.dialogCancel}
                onClick={() => setShowDialog(false)}
                type="button"
              >
                Abbrechen
              </button>
              <button
                className={styles.dialogConfirm}
                onClick={handleDelete}
                disabled={deleting}
                type="button"
              >
                {deleting ? "Loeschen..." : "Endgueltig loeschen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
