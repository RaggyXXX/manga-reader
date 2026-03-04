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
        Remove Series
      </button>

      {showDialog && (
        <div className={styles.dialogOverlay} onClick={() => setShowDialog(false)}>
          <div className={styles.dialogBox} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.dialogTitle}>Remove series?</h3>
            <p className={styles.dialogText}>
              &laquo;{seriesTitle}&raquo; and all related chapters will be permanently deleted.
            </p>
            <div className={styles.dialogActions}>
              <button
                className={styles.dialogCancel}
                onClick={() => setShowDialog(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className={styles.dialogConfirm}
                onClick={handleDelete}
                disabled={deleting}
                type="button"
              >
                {deleting ? "Deleting..." : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
