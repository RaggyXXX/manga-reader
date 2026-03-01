import Link from "next/link";
import styles from "./page.module.css";
import { connectDB } from "@/lib/db";
import Series from "@/lib/models/Series";
import { SeriesCard } from "@/components/SeriesCard";
import { ContinueReading } from "@/components/ContinueReading";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  await connectDB();
  const series = await Series.find({}).sort({ updatedAt: -1 }).lean();

  const isEmpty = series.length === 0;

  return (
    <div className={styles.page}>
      {/* --- Glassmorphism header --- */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          {/* Sakura blossom decorative SVG */}
          <svg
            className={styles.sakura}
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M12 2C12 2 14 6.5 14 8.5C14 10.5 12 12 12 12C12 12 10 10.5 10 8.5C10 6.5 12 2 12 2Z"
              fill="#f2a0b3"
              opacity="0.9"
            />
            <path
              d="M22 12C22 12 17.5 14 15.5 14C13.5 14 12 12 12 12C12 12 13.5 10 15.5 10C17.5 10 22 12 22 12Z"
              fill="#f2a0b3"
              opacity="0.75"
            />
            <path
              d="M12 22C12 22 10 17.5 10 15.5C10 13.5 12 12 12 12C12 12 14 13.5 14 15.5C14 17.5 12 22 12 22Z"
              fill="#f2a0b3"
              opacity="0.65"
            />
            <path
              d="M2 12C2 12 6.5 10 8.5 10C10.5 10 12 12 12 12C12 12 10.5 14 8.5 14C6.5 14 2 12 2 12Z"
              fill="#f2a0b3"
              opacity="0.8"
            />
            <path
              d="M4.93 4.93C4.93 4.93 8.5 7.5 9.5 9C10.5 10.5 12 12 12 12C12 12 9.5 11.5 8 10.5C6.5 9.5 4.93 4.93 4.93 4.93Z"
              fill="#f5b3c2"
              opacity="0.55"
            />
            <path
              d="M19.07 4.93C19.07 4.93 15.5 7.5 14.5 9C13.5 10.5 12 12 12 12C12 12 14.5 11.5 16 10.5C17.5 9.5 19.07 4.93 19.07 4.93Z"
              fill="#f5b3c2"
              opacity="0.55"
            />
            <circle cx="12" cy="12" r="2.5" fill="#e8a849" opacity="0.9" />
          </svg>
          <h1 className={styles.title}>Manga Reader</h1>
        </div>

        {/* Stats link */}
        <Link href="/stats" className={styles.statsLink} aria-label="Statistiken">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="12" width="4" height="9" rx="1" />
            <rect x="10" y="7" width="4" height="14" rx="1" />
            <rect x="17" y="3" width="4" height="18" rx="1" />
          </svg>
        </Link>
      </header>

      {!isEmpty && (
        <ContinueReading
          series={series.map((s) => ({
            slug: s.slug,
            title: s.title,
            coverUrl: s.coverUrl || "",
            totalChapters: s.totalChapters,
          }))}
        />
      )}

      {/* --- Content --- */}
      {isEmpty ? (
        <div className={styles.empty}>
          {/* Cute chibi character reading a book — decorative inline SVG */}
          <svg
            className={styles.emptyIllustration}
            width="140"
            height="140"
            viewBox="0 0 140 140"
            fill="none"
            aria-hidden="true"
          >
            {/* Body / sitting shape */}
            <ellipse cx="70" cy="110" rx="32" ry="14" fill="#2c2520" />
            <rect x="48" y="60" width="44" height="50" rx="22" fill="#e8a849" opacity="0.15" />

            {/* Head */}
            <circle cx="70" cy="48" r="26" fill="#3d342c" />
            {/* Hair */}
            <ellipse cx="70" cy="36" rx="28" ry="18" fill="#2c2520" />
            <ellipse cx="54" cy="44" rx="6" ry="10" fill="#2c2520" />
            <ellipse cx="86" cy="44" rx="6" ry="10" fill="#2c2520" />

            {/* Face */}
            <circle cx="61" cy="50" r="3" fill="#f0e6d6" />
            <circle cx="79" cy="50" r="3" fill="#f0e6d6" />
            <circle cx="62" cy="51" r="1.5" fill="#1a1612" />
            <circle cx="80" cy="51" r="1.5" fill="#1a1612" />
            {/* Blush */}
            <ellipse cx="56" cy="56" rx="4" ry="2.5" fill="#f2a0b3" opacity="0.4" />
            <ellipse cx="84" cy="56" rx="4" ry="2.5" fill="#f2a0b3" opacity="0.4" />
            {/* Mouth — happy */}
            <path d="M66 58 Q70 62 74 58" stroke="#8a7a6a" strokeWidth="1.5" fill="none" strokeLinecap="round" />

            {/* Book */}
            <rect x="50" y="78" width="40" height="28" rx="3" fill="#e8a849" opacity="0.8" />
            <line x1="70" y1="78" x2="70" y2="106" stroke="#1a1612" strokeWidth="1.5" opacity="0.3" />
            {/* Pages lines */}
            <line x1="55" y1="86" x2="67" y2="86" stroke="#1a1612" strokeWidth="1" opacity="0.15" />
            <line x1="55" y1="90" x2="65" y2="90" stroke="#1a1612" strokeWidth="1" opacity="0.15" />
            <line x1="55" y1="94" x2="66" y2="94" stroke="#1a1612" strokeWidth="1" opacity="0.15" />
            <line x1="73" y1="86" x2="85" y2="86" stroke="#1a1612" strokeWidth="1" opacity="0.15" />
            <line x1="73" y1="90" x2="83" y2="90" stroke="#1a1612" strokeWidth="1" opacity="0.15" />
            <line x1="73" y1="94" x2="84" y2="94" stroke="#1a1612" strokeWidth="1" opacity="0.15" />

            {/* Arms holding book */}
            <path d="M48 75 Q46 85 50 90" stroke="#3d342c" strokeWidth="6" fill="none" strokeLinecap="round" />
            <path d="M92 75 Q94 85 90 90" stroke="#3d342c" strokeWidth="6" fill="none" strokeLinecap="round" />

            {/* Small sparkles around */}
            <circle cx="30" cy="30" r="2" fill="#e8a849" opacity="0.5" />
            <circle cx="110" cy="35" r="1.5" fill="#f2a0b3" opacity="0.4" />
            <circle cx="25" cy="70" r="1.5" fill="#e8a849" opacity="0.3" />
            <circle cx="115" cy="75" r="2" fill="#f2a0b3" opacity="0.35" />
          </svg>

          <p className={styles.emptyTitle}>Deine Bibliothek ist leer</p>
          <p className={styles.emptySubtitle}>Fuege deine erste Serie hinzu!</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {series.map((s) => (
            <SeriesCard
              key={s._id.toString()}
              slug={s.slug}
              title={s.title}
              coverUrl={s.coverUrl}
              totalChapters={s.totalChapters}
              crawledChapters={s.crawledChapters}
              status={s.status}
            />
          ))}
        </div>
      )}

      {/* --- FAB (add series) --- */}
      <Link
        href="/add"
        className={isEmpty ? styles.fabPulse : styles.fab}
        aria-label="Serie hinzufuegen"
      >
        +
      </Link>
    </div>
  );
}
