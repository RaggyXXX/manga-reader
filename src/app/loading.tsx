import { Skeleton } from "@/components/Skeleton";
import styles from "./loading.module.css";

export default function LibraryLoading() {
  return (
    <div className={styles.page}>
      {/* Header skeleton */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Skeleton width={22} height={22} borderRadius="50%" />
          <Skeleton width={130} height={22} borderRadius="var(--radius-sm)" />
        </div>
        <Skeleton width={36} height={36} borderRadius="var(--radius-sm)" />
      </header>

      {/* Series grid skeleton */}
      <div className={styles.grid}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className={styles.card} />
        ))}
      </div>
    </div>
  );
}
