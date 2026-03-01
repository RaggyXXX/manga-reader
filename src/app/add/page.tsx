"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import Link from "next/link";

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
      const res = await fetch("/api/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Fehler beim Hinzufuegen");
        return;
      }

      if (data.series?.slug) {
        router.push(`/series/${data.series.slug}`);
      }
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
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
          Manhwazone URL
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://manhwazone.to/series/..."
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
            Die Serie wird gecrawlt. Dies kann 10-20 Sekunden dauern...
          </p>
        )}
      </form>
    </div>
  );
}
