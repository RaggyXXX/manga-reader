"use client";

import { useSyncContext } from "@/contexts/SyncContext";
import styles from "./SyncProgressBar.module.css";

export function SyncProgressBar() {
  const { phase, discovered, completed, total, error, stopSync } = useSyncContext();

  if (phase === "idle") return null;

  if (phase === "error") {
    return (
      <div className={`${styles.bar} ${styles.barError}`}>
        <span className={styles.text}>{error || "Sync fehlgeschlagen"}</span>
      </div>
    );
  }

  const isDiscovering = phase === "discovering";
  const pct = isDiscovering ? 100 : total > 0 ? (completed / total) * 100 : 0;

  return (
    <div className={styles.bar}>
      <div
        className={`${styles.fill} ${isDiscovering ? styles.shimmer : ""}`}
        style={isDiscovering ? undefined : { width: `${pct}%` }}
      />
      <span className={styles.text}>
        {isDiscovering
          ? `Kapitel entdecken... ${discovered}`
          : `${completed} / ${total}`}
      </span>
      <button
        className={styles.stopBtn}
        onClick={stopSync}
        title="Sync stoppen"
        type="button"
      >
        <span className={styles.stopIcon} />
      </button>
    </div>
  );
}
