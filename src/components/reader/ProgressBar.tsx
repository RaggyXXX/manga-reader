'use client';

import styles from './ProgressBar.module.css';

interface ProgressBarProps {
  percent: number;
  visible: boolean;
}

export default function ProgressBar({ percent, visible }: ProgressBarProps) {
  const clampedPercent = Math.min(100, Math.max(0, percent));

  return (
    <div
      className={styles.track}
      style={{ opacity: visible ? 1 : 0 }}
      role="progressbar"
      aria-valuenow={clampedPercent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={styles.fill}
        style={{ width: `${clampedPercent}%` }}
      />
    </div>
  );
}
