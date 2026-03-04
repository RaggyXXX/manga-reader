"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import Link from "next/link";
import { discoverSeries, detectSource } from "@/lib/scraper";
import { saveSeries, getAllSeries } from "@/lib/manga-store";
import { SearchResultCard } from "@/components/SearchResultCard";
import { PreviewModal } from "@/components/PreviewModal";
import type { MangaSource } from "@/lib/manga-store";

interface SearchResult {
  title: string;
  coverUrl: string;
  sourceUrl: string;
  source: MangaSource;
  sourceId?: string;
  availableLanguages?: string[];
}

type Mode = "search" | "url";

export default function AddSeriesPage() {
  const [mode, setMode] = useState<Mode>("search");
  const router = useRouter();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.backBtn} aria-label="Zurueck">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <h1 className={styles.title}>Serie hinzufuegen</h1>
      </header>

      {/* Mode toggle */}
      <div className={styles.modeToggle}>
        <button
          className={`${styles.modeBtn} ${mode === "search" ? styles.modeBtnActive : ""}`}
          onClick={() => setMode("search")}
          type="button"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          Suche
        </button>
        <button
          className={`${styles.modeBtn} ${mode === "url" ? styles.modeBtnActive : ""}`}
          onClick={() => setMode("url")}
          type="button"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          URL eingeben
        </button>
      </div>

      {mode === "search" ? <SearchMode router={router} /> : <UrlMode router={router} />}

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

// ── Search Mode ──

const SOURCE_FILTERS: { key: MangaSource | "all"; label: string; color: string }[] = [
  { key: "all", label: "Alle", color: "var(--accent)" },
  { key: "mangadex", label: "MangaDex", color: "#ff6740" },
  { key: "mangakatana", label: "MangaKatana", color: "#4a90d9" },
  { key: "vymanga", label: "VyManga", color: "#6bc95b" },
  { key: "manhwazone", label: "Manhwazone", color: "#e8a849" },
];

function SearchMode({ router }: { router: ReturnType<typeof useRouter> }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [partialErrors, setPartialErrors] = useState<string[]>([]);
  const [addingUrl, setAddingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<MangaSource | "all">("all");
  const [preview, setPreview] = useState<SearchResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    // Abort previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSearching(true);
    setError(null);
    setPartialErrors([]);

    try {
      const resp = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      });
      if (!resp.ok) throw new Error(`Search failed: ${resp.status}`);
      const data = await resp.json();

      if (!controller.signal.aborted) {
        setResults(data.results || []);
        setSearched(true);
        if (data.errors?.length > 0) {
          setPartialErrors(data.errors.map((e: { source: string }) => e.source));
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "Suche fehlgeschlagen");
        setResults([]);
        setSearched(true);
      }
    } finally {
      if (!controller.signal.aborted) {
        setSearching(false);
      }
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setResults([]);
      setSearched(false);
      setSearching(false);
      setPartialErrors([]);
      setError(null);
      abortRef.current?.abort();
      return;
    }

    debounceRef.current = setTimeout(() => {
      doSearch(query.trim());
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  const handleClickResult = (result: SearchResult) => {
    // Check for duplicates
    const existing = getAllSeries();
    const isDuplicate = existing.some((s) => s.sourceUrl === result.sourceUrl);
    if (isDuplicate) {
      const slug = existing.find((s) => s.sourceUrl === result.sourceUrl)!.slug;
      router.push(`/series/${slug}`);
      return;
    }
    setPreview(result);
  };

  const handleConfirmAdd = async () => {
    if (!preview) return;

    setAddingUrl(preview.sourceUrl);
    setError(null);

    try {
      const discovered = await discoverSeries(preview.sourceUrl);
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
      setPreview(null);
    } finally {
      setAddingUrl(null);
    }
  };

  const filtered = sourceFilter === "all"
    ? results
    : results.filter((r) => r.source === sourceFilter);

  return (
    <>
      {/* Search input */}
      <div className={styles.form}>
        <div className={styles.searchInputWrap}>
          <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Manga suchen..."
            className={styles.searchInput}
            autoFocus
          />
        </div>

        {/* Source filter chips */}
        <div className={styles.filterRow}>
          {SOURCE_FILTERS.map((sf) => (
            <button
              key={sf.key}
              type="button"
              className={`${styles.filterChip} ${sourceFilter === sf.key ? styles.filterChipActive : ""}`}
              style={sourceFilter === sf.key ? { borderColor: sf.color, background: `${sf.color}18` } : undefined}
              onClick={() => setSourceFilter(sf.key)}
            >
              <span className={styles.filterDot} style={{ background: sf.color }} />
              {sf.label}
            </button>
          ))}
        </div>

        {error && <p className={styles.error}>{error}</p>}

        {partialErrors.length > 0 && (
          <p className={styles.warning}>
            Einige Quellen nicht erreichbar: {partialErrors.join(", ")}
          </p>
        )}
      </div>

      {/* Results */}
      {searching && (
        <div className={styles.resultsList}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={styles.skeletonCard}>
              <div className={styles.skeletonCover} />
              <div className={styles.skeletonLines}>
                <div className={styles.skeletonLine} />
                <div className={styles.skeletonLine} />
              </div>
            </div>
          ))}
        </div>
      )}

      {!searching && searched && filtered.length === 0 && !error && (
        <div className={styles.noResults}>
          <p className={styles.noResultsText}>Keine Ergebnisse gefunden</p>
        </div>
      )}

      {!searching && filtered.length > 0 && (
        <div className={styles.resultsList}>
          {filtered.map((r, i) => (
            <SearchResultCard
              key={`${r.source}-${r.sourceUrl}-${i}`}
              title={r.title}
              coverUrl={r.coverUrl}
              source={r.source}
              availableLanguages={r.availableLanguages}
              loading={addingUrl === r.sourceUrl}
              disabled={addingUrl !== null}
              onClick={() => handleClickResult(r)}
            />
          ))}
        </div>
      )}

      {!searching && !searched && query.trim().length > 0 && query.trim().length < 2 && (
        <p className={styles.minChars}>Mindestens 2 Zeichen eingeben</p>
      )}

      {/* Preview modal */}
      {preview && (
        <PreviewModal
          data={preview}
          onAdd={handleConfirmAdd}
          onClose={() => setPreview(null)}
          adding={addingUrl === preview.sourceUrl}
        />
      )}
    </>
  );
}

// ── URL Mode ──

function UrlMode({ router }: { router: ReturnType<typeof useRouter> }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      <button type="submit" className={styles.button} disabled={loading || !url.trim()}>
        {loading ? (
          <span className={styles.spinner}>
            <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
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

      {loading && <p className={styles.hint}>Serie wird geladen...</p>}
    </form>
  );
}
