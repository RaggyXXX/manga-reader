"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownAZ, ArrowUpZA, ChevronDown, Filter, Loader2, Search, Sparkles, X } from "lucide-react";
import { discoverSeries, imageProxyUrl } from "@/lib/scraper";
import { getAllSeries, saveSeries, type MangaSource } from "@/lib/manga-store";
import { SearchResultCard } from "@/components/SearchResultCard";
import { FeaturedMangaCard } from "@/components/FeaturedMangaCard";
import { PreviewModal } from "@/components/PreviewModal";
import { Input } from "@/components/ui/input";

interface SearchResult {
  title: string;
  coverUrl: string;
  sourceUrl: string;
  source: MangaSource;
  sourceId?: string;
  availableLanguages?: string[];
  chapterCount?: number;
}

type SortMode = "relevance" | "a-z" | "z-a" | "chapters-desc" | "chapters-asc";

const SOURCE_FILTERS: { key: MangaSource | "all"; label: string; color: string }[] = [
  { key: "all", label: "All sources", color: "#b57f44" },
  { key: "mangadex", label: "MangaDex", color: "#ff6740" },
  { key: "mangakatana", label: "MangaKatana", color: "#4a90d9" },
  { key: "manhwazone", label: "Manhwazone", color: "#e8a849" },
  { key: "weebcentral", label: "WeebCentral", color: "#7c3aed" },
  { key: "atsumaru", label: "Atsumaru", color: "#10b981" },
  { key: "mangabuddy", label: "MangaBuddy", color: "#f43f5e" },
];


export function AddSeriesPage() {
  const router = useRouter();

  return (
    <div className="space-y-5">
      <SearchMode router={router} />
    </div>
  );
}

function SearchMode({ router }: { router: ReturnType<typeof useRouter> }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [featured, setFeatured] = useState<SearchResult[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [featuredError, setFeaturedError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [partialErrors, setPartialErrors] = useState<string[]>([]);
  const [addingUrl, setAddingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<MangaSource | "all">("all");
  const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [preview, setPreview] = useState<SearchResult | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("relevance");
  const [minChapters, setMinChapters] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const sortDropdownRef = useRef<HTMLDivElement | null>(null);

  const doSearch = useCallback(async (q: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSearching(true);
    setError(null);
    setPartialErrors([]);

    try {
      const resp = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
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
        setError(err instanceof Error ? err.message : "Search failed");
        setResults([]);
        setSearched(true);
      }
    } finally {
      if (!controller.signal.aborted) {
        setSearching(false);
      }
    }
  }, []);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live search with debounce
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
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  useEffect(() => {
    let cancelled = false;

    async function loadFeatured() {
      setFeaturedLoading(true);
      setFeaturedError(null);

      try {
        const resp = await fetch("/api/featured");
        if (!resp.ok) throw new Error(`Featured failed: ${resp.status}`);
        const data = await resp.json();
        if (!cancelled) {
          setFeatured(data.results || []);
        }
      } catch (err) {
        if (!cancelled) {
          setFeatured([]);
          setFeaturedError(err instanceof Error ? err.message : "Failed to load featured manga");
        }
      } finally {
        if (!cancelled) {
          setFeaturedLoading(false);
        }
      }
    }

    loadFeatured();
    return () => {
      cancelled = true;
    };
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSourceDropdownOpen(false);
      }
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setSortDropdownOpen(false);
      }
    }
    if (sourceDropdownOpen || sortDropdownOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [sourceDropdownOpen, sortDropdownOpen]);

  const filtered = useMemo(() => {
    let list = sourceFilter === "all" ? results : results.filter((r) => r.source === sourceFilter);

    // Apply min chapters filter
    if (minChapters > 0) {
      list = list.filter((r) => (r.chapterCount ?? 0) >= minChapters);
    }

    // Apply sorting
    if (sortMode !== "relevance") {
      list = [...list].sort((a, b) => {
        switch (sortMode) {
          case "a-z": return a.title.localeCompare(b.title);
          case "z-a": return b.title.localeCompare(a.title);
          case "chapters-desc": return (b.chapterCount ?? 0) - (a.chapterCount ?? 0);
          case "chapters-asc": return (a.chapterCount ?? 0) - (b.chapterCount ?? 0);
          default: return 0;
        }
      });
    }

    return list;
  }, [results, sourceFilter, sortMode, minChapters]);

  const handleClickResult = (result: SearchResult) => {
    void (async () => {
      const existing = await getAllSeries();
      const duplicate = existing.find((s) => s.sourceUrl === result.sourceUrl);
      if (duplicate) {
        router.push(`/series/${duplicate.slug}`);
        return;
      }
      setPreview(result);
    })();
  };

  const handleConfirmAdd = async (preferredLanguage?: string) => {
    if (!preview) return;

    setAddingUrl(preview.sourceUrl);
    setError(null);

    try {
      const discovered = await discoverSeries(preview.sourceUrl);
      const slug = discovered.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const newSeries = {
        slug,
        title: discovered.title,
        coverUrl: discovered.coverUrl,
        sourceUrl: discovered.sourceUrl,
        totalChapters: 0,
        addedAt: Date.now(),
        source: discovered.source,
        sourceId: discovered.sourceId,
        ...(preferredLanguage ? { preferredLanguage } : {}),
      };
      await saveSeries(newSeries);

      // Pre-cache cover image
      if (discovered.coverUrl) {
        fetch(imageProxyUrl(discovered.coverUrl, discovered.source)).catch(() => {});
      }

      router.push(`/series/${slug}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to load series: ${msg}`);
      setPreview(null);
    } finally {
      setAddingUrl(null);
    }
  };

  const SORT_OPTIONS: { key: SortMode; label: string; icon?: React.ReactNode }[] = [
    { key: "relevance", label: "Relevance" },
    { key: "a-z", label: "Title A-Z", icon: <ArrowDownAZ className="h-3.5 w-3.5" /> },
    { key: "z-a", label: "Title Z-A", icon: <ArrowUpZA className="h-3.5 w-3.5" /> },
    { key: "chapters-desc", label: "Most chapters" },
    { key: "chapters-asc", label: "Fewest chapters" },
  ];

  return (
    <>
      <div className="space-y-3">
        {/* Search input */}
        <div className="relative" data-tour="add-search-input">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search manga..."
            className="pl-9 pr-10"
            autoFocus
            ref={inputRef}
          />
          {query.trim().length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setResults([]);
                setSearched(false);
                setError(null);
                setPartialErrors([]);
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {/* Source filter */}
        <div className="relative" ref={dropdownRef} data-tour="add-source-filter">
          <button
            type="button"
            onClick={() => setSourceDropdownOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
          >
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: SOURCE_FILTERS.find((sf) => sf.key === sourceFilter)?.color }} />
              {SOURCE_FILTERS.find((sf) => sf.key === sourceFilter)?.label}
            </span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${sourceDropdownOpen ? "rotate-180" : ""}`} />
          </button>
          {sourceDropdownOpen && (
            <div className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
              {SOURCE_FILTERS.map((sf) => (
                <button
                  key={sf.key}
                  type="button"
                  onClick={() => { setSourceFilter(sf.key); setSourceDropdownOpen(false); }}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                    sourceFilter === sf.key
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-foreground hover:bg-muted/50"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: sf.color }} />
                  {sf.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {partialErrors.length > 0 ? (
          <p className="text-xs text-amber-700">Some sources are unavailable: {partialErrors.join(", ")}</p>
        ) : null}
      </div>

      {/* Loading spinner */}
      {searching ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Searching across sources...</p>
        </div>
      ) : null}

      {/* Sort + filter toolbar */}
      {!searching && searched && results.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          {/* Sort dropdown */}
          <div className="relative" ref={sortDropdownRef}>
            <button
              type="button"
              onClick={() => setSortDropdownOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/50"
            >
              <ArrowDownAZ className="h-3.5 w-3.5 text-muted-foreground" />
              {SORT_OPTIONS.find((o) => o.key === sortMode)?.label}
              <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${sortDropdownOpen ? "rotate-180" : ""}`} />
            </button>
            {sortDropdownOpen && (
              <div className="absolute left-0 z-20 mt-1 min-w-[160px] overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => { setSortMode(opt.key); setSortDropdownOpen(false); }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors ${
                      sortMode === opt.key
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-foreground hover:bg-muted/50"
                    }`}
                  >
                    {opt.icon || <span className="h-3.5 w-3.5" />}
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Min chapters filter */}
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <label className="text-xs text-muted-foreground whitespace-nowrap">Min chapters</label>
            <input
              type="number"
              min={0}
              max={9999}
              value={minChapters || ""}
              onChange={(e) => setMinChapters(Math.max(0, parseInt(e.target.value) || 0))}
              placeholder="0"
              className="w-14 bg-transparent text-xs font-medium text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>

          {/* Result count */}
          <span className="ml-auto text-xs text-muted-foreground">
            {filtered.length} of {results.length} result{results.length === 1 ? "" : "s"}
          </span>
        </div>
      ) : null}

      {!searching && searched && filtered.length === 0 && !error ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4" />
          {results.length > 0 ? "No results match your filters" : "No results found"}
        </p>
      ) : null}

      {!searching && filtered.length > 0 ? (
        <div className="grid gap-3">
          {filtered.map((r, i) => (
            <SearchResultCard
              key={`${r.source}-${r.sourceUrl}-${i}`}
              title={r.title}
              coverUrl={r.coverUrl}
              source={r.source}
              chapterCount={r.chapterCount}
              availableLanguages={r.availableLanguages}
              loading={addingUrl === r.sourceUrl}
              disabled={addingUrl !== null}
              onClick={() => handleClickResult(r)}
            />
          ))}
        </div>
      ) : null}

      {!searching && !searched && query.trim().length > 0 && query.trim().length < 2 ? (
        <p className="text-sm text-muted-foreground">Enter at least 2 characters</p>
      ) : null}

      {!searching && !searched && query.trim().length === 0 ? (
        <section className="space-y-3" aria-label="Featured manga" data-tour="add-featured">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Featured</h2>
              <p className="text-sm text-muted-foreground">20 popular manga right now</p>
            </div>
            <Sparkles className="h-5 w-5 text-primary" />
          </div>

          {featuredLoading ? (
            <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-card px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Loading featured manga...
            </div>
          ) : null}

          {!featuredLoading && featuredError ? (
            <p className="text-sm text-muted-foreground">Featured manga could not be loaded right now.</p>
          ) : null}

          {!featuredLoading && !featuredError && featured.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {featured.map((item, index) => (
                <FeaturedMangaCard
                  key={`${item.source}-${item.sourceUrl}-${index}`}
                  title={item.title}
                  coverUrl={item.coverUrl}
                  source={item.source}
                  chapterCount={item.chapterCount}
                  onClick={() => handleClickResult(item)}
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {preview ? (
        <PreviewModal
          data={preview}
          onAdd={handleConfirmAdd}
          onClose={() => setPreview(null)}
          adding={addingUrl === preview.sourceUrl}
        />
      ) : null}
    </>
  );
}

export default AddSeriesPage;
