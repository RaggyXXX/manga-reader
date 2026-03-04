"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import Link from "next/link";
import { discoverSeries, detectSource } from "@/lib/scraper";
import { saveSeries } from "@/lib/manga-store";

export default function AddSeriesPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const trimmedUrl = url.trim();
      const source = detectSource(trimmedUrl);
      const supported = ["manhwazone", "mangadex", "mangakatana", "vymanga"];
      if (!supported.includes(source)) {
        setError("Nicht unterstuetzte Seite. Unterstuetzt: MangaDex, MangaKatana, VyManga, Manhwazone");
        setLoading(false);
        return;
      }

      const discovered = await discoverSeries(trimmedUrl);

      const slug = discovered.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      saveSeries({
        slug,
        title: discovered.title,
        coverUrl: discovered.coverUrl,
        sourceUrl: discovered.sourceUrl,
        totalChapters: 0,
        addedAt: Date.now(),
        source: discovered.source,
        sourceId: discovered.sourceId,
      });

      router.push(`/series/${slug}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Fehler beim Laden der Serie: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      {/* Glassmorphism header */}
      <header className={styles.header}>
        <Link href="/" className={styles.backBtn} aria-label="Zurueck">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <h1 className={styles.title}>Serie hinzufuegen</h1>
      </header>

      {/* Form card */}
      <form onSubmit={handleSubmit} className={styles.form}>
        <label className={styles.label}>
          Manga URL
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://mangadex.org/title/... oder manhwazone.to/series/..."
            className={styles.input}
            disabled={loading}
            autoFocus
          />
        </label>

        {error && <p className={styles.error}>{error}</p>}

        <button
          type="submit"
          className={styles.button}
          disabled={loading || !url.trim()}
        >
          {loading ? (
            <span className={styles.spinner}>
              <svg
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M16 2C16 2 18 8 22 12C26 16 32 16 32 16C32 16 26 18 22 22C18 26 16 32 16 32C16 32 14 26 10 22C6 18 0 16 0 16C0 16 6 14 10 10C14 6 16 2 16 2Z"
                  fill="#f2a0b3"
                  opacity="0.9"
                />
              </svg>
            </span>
          ) : (
            "Serie entdecken"
          )}
        </button>

        {loading && (
          <p className={styles.hint}>
            Serie wird geladen...
          </p>
        )}
      </form>

      {/* Supported sources */}
      <div className={styles.sources}>
        <h2 className={styles.sourcesTitle}>Unterstuetzte Quellen</h2>
        <div className={styles.sourcesList}>
          {[
            { name: "MangaDex", domain: "mangadex.org", color: "#ff6740" },
            { name: "MangaKatana", domain: "mangakatana.com", color: "#4a90d9" },
            { name: "VyManga", domain: "vymanga.com", color: "#6bc95b" },
            { name: "Manhwazone", domain: "manhwazone.to", color: "#e8a849" },
          ].map((s) => (
            <div key={s.name} className={styles.sourceItem}>
              <span className={styles.sourceDot} style={{ background: s.color }} />
              <div>
                <span className={styles.sourceName}>{s.name}</span>
                <span className={styles.sourceDomain}>{s.domain}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
