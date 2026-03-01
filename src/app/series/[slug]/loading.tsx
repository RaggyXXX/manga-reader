import { Skeleton } from "@/components/Skeleton";
import styles from "./loading.module.css";

export default function SeriesDetailLoading() {
  return (
    <div className={styles.page}>
      {/* Header with back button and title */}
      <header className={styles.header}>
        <Skeleton width={36} height={36} borderRadius="var(--radius-sm)" />
        <Skeleton width="60%" height={18} borderRadius="var(--radius-sm)" />
      </header>

      {/* Info card: cover + details */}
      <div className={styles.infoCard}>
        {/* Cover image skeleton */}
        <Skeleton
          width={120}
          height={170}
          borderRadius="var(--radius)"
        />

        {/* Details column */}
        <div className={styles.details}>
          {/* Title */}
          <Skeleton
            width="60%"
            height={24}
            borderRadius="var(--radius-sm)"
          />
          {/* Badge row */}
          <Skeleton
            width={80}
            height={24}
            borderRadius="var(--radius-pill)"
          />
          {/* Status badge */}
          <Skeleton
            width={80}
            height={24}
            borderRadius="var(--radius-pill)"
          />
        </div>
      </div>

      {/* Chapter list skeletons */}
      <div className={styles.chapterList}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={styles.chapterItem}>
            <Skeleton width="100%" height={20} borderRadius="var(--radius-sm)" />
          </div>
        ))}
      </div>
    </div>
  );
}
