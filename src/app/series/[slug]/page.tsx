import { connectDB } from "@/lib/db";
import Series from "@/lib/models/Series";
import Chapter from "@/lib/models/Chapter";
import { notFound } from "next/navigation";
import { ChapterList } from "@/components/ChapterList";
import { DeleteSeriesButton } from "./DeleteSeriesButton";
import styles from "./page.module.css";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function SeriesPage({ params }: Props) {
  const { slug } = await params;
  await connectDB();

  const series = await Series.findOne({ slug }).lean();
  if (!series) notFound();

  const chapters = await Chapter.find({ seriesId: series._id })
    .sort({ number: 1 })
    .select("_id number title status pageCount")
    .lean();

  const chaptersPlain = chapters.map((ch) => ({
    id: ch._id.toString(),
    number: ch.number,
    title: ch.title,
    status: ch.status,
    pageCount: ch.pageCount,
  }));

  const crawledCount = chapters.filter((ch) => ch.status === "crawled").length;

  return (
    <div className={styles.page}>
      {/* Glassmorphism sticky header */}
      <header className={styles.header}>
        <Link href="/" className={styles.backBtn} aria-label="Zurueck">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <h1 className={styles.headerTitle}>{series.title}</h1>
      </header>

      {/* Series info card */}
      <div className={styles.infoCard}>
        {series.coverUrl ? (
          <img
            src={`/api/img?url=${encodeURIComponent(series.coverUrl)}`}
            alt={series.title}
            className={styles.cover}
          />
        ) : (
          <div className={styles.coverPlaceholder}>&#9744;</div>
        )}

        <div className={styles.details}>
          <h2 className={styles.seriesTitle}>{series.title}</h2>

          <div className={styles.badges}>
            <span className={styles.badge}>
              {series.totalChapters} Kapitel
            </span>
            <span className={`${styles.badge} ${styles.badgeCrawled}`}>
              {crawledCount} bereit
            </span>
          </div>

          <div className={styles.statusRow}>
            {series.status === "complete" ? (
              <span className={`${styles.statusBadge} ${styles.statusComplete}`}>
                <span className={styles.sparkle}>&#10024;</span>
                Komplett
              </span>
            ) : (
              <span className={`${styles.statusBadge} ${styles.statusOngoing}`}>
                Laufend
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Delete button */}
      <div className={styles.dangerZone}>
        <DeleteSeriesButton seriesSlug={slug} seriesTitle={series.title} />
      </div>

      {/* Chapter list */}
      <ChapterList
        chapters={chaptersPlain}
        seriesSlug={slug}
        seriesId={series._id.toString()}
      />
    </div>
  );
}
