"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LinkIcon, Search, Sparkles, X } from "lucide-react";
import { discoverSeries, detectSource, imageProxyUrl } from "@/lib/scraper";
import { getAllSeries, saveSeries, type MangaSource } from "@/lib/manga-store";
import { SearchResultCard } from "@/components/SearchResultCard";
import { PreviewModal } from "@/components/PreviewModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContextBackChevron } from "@/components/navigation/ContextBackChevron";

interface SearchResult {
  title: string;
  coverUrl: string;
  sourceUrl: string;
  source: MangaSource;
  sourceId?: string;
  availableLanguages?: string[];
}

type Mode = "search" | "url";

const SOURCE_FILTERS: { key: MangaSource | "all"; label: string; color: string }[] = [
  { key: "all", label: "All sources", color: "#b57f44" },
  { key: "mangadex", label: "MangaDex", color: "#ff6740" },
  { key: "mangakatana", label: "MangaKatana", color: "#4a90d9" },
  { key: "vymanga", label: "VyManga", color: "#6bc95b" },
  { key: "manhwazone", label: "Manhwazone", color: "#e8a849" },
];

const SOURCES = [
  { name: "MangaDex", domain: "mangadex.org", color: "#ff6740" },
  { name: "MangaKatana", domain: "mangakatana.com", color: "#4a90d9" },
  { name: "VyManga", domain: "vymanga.com", color: "#6bc95b" },
  { name: "Manhwazone", domain: "manhwazone.to", color: "#e8a849" },
];

export default function AddSeriesPage() {
  const [mode, setMode] = useState<Mode>("search");
  const router = useRouter();

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3">
        <ContextBackChevron className="mt-0.5 shrink-0" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Add Series</h1>
          <p className="text-sm text-muted-foreground">Search across sources or add directly with a URL.</p>
        </div>
      </header>

      <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
        <TabsList>
          <TabsTrigger value="search" data-tour="add-search-tab">
            <span className="inline-flex items-center gap-2"><Search className="h-4 w-4" /> Search</span>
          </TabsTrigger>
          <TabsTrigger value="url" data-tour="add-url-tab">
            <span className="inline-flex items-center gap-2"><LinkIcon className="h-4 w-4" /> URL</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="search">
          <SearchMode router={router} />
        </TabsContent>
        <TabsContent value="url">
          <UrlMode router={router} />
        </TabsContent>
      </Tabs>

      <details open className="group overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supported sources</p>
            <p className="mt-0.5 text-sm text-foreground/90">MangaDex, MangaKatana, VyManga, Manhwazone</p>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-border/70 p-4 pt-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {SOURCES.map((s) => (
              <div key={s.name} className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/70 px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                <div>
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.domain}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}

function SearchMode({ router }: { router: ReturnType<typeof useRouter> }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [partialErrors, setPartialErrors] = useState<string[]>([]);
  const [addingUrl, setAddingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<MangaSource | "all">("all");
  const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false);
  const [preview, setPreview] = useState<SearchResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

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

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSourceDropdownOpen(false);
      }
    }
    if (sourceDropdownOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [sourceDropdownOpen]);

  const filtered = useMemo(
    () => (sourceFilter === "all" ? results : results.filter((r) => r.source === sourceFilter)),
    [results, sourceFilter],
  );

  const handleClickResult = (result: SearchResult) => {
    const existing = getAllSeries();
    const duplicate = existing.find((s) => s.sourceUrl === result.sourceUrl);
    if (duplicate) {
      router.push(`/series/${duplicate.slug}`);
      return;
    }
    setPreview(result);
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
      saveSeries(newSeries);

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

  return (
    <>
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="relative">
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
                  inputRef.current?.focus();
                }}
                className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Clear search"
                title="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="relative" ref={dropdownRef}>
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
        </CardContent>
      </Card>

      {searching ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="flex items-center gap-3 p-3">
                <Skeleton className="h-24 w-16 rounded-md" />
                <div className="w-full space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {!searching && searched && filtered.length === 0 && !error ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            No results found
          </CardContent>
        </Card>
      ) : null}

      {!searching && filtered.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{filtered.length} result{filtered.length === 1 ? "" : "s"}</span>
            <span>{sourceFilter === "all" ? "All sources" : `Source: ${sourceFilter}`}</span>
          </div>
          <div className="grid gap-3">
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
        </div>
      ) : null}

      {!searching && !searched && query.trim().length > 0 && query.trim().length < 2 ? (
        <p className="text-sm text-muted-foreground">Enter at least 2 characters</p>
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
        setError("Unsupported source. Supported: MangaDex, MangaKatana, VyManga, Manhwazone");
        setLoading(false);
        return;
      }

      const discovered = await discoverSeries(trimmedUrl);
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
      };
      saveSeries(newSeries);

      // Pre-cache cover image
      if (discovered.coverUrl) {
        fetch(imageProxyUrl(discovered.coverUrl, discovered.source)).catch(() => {});
      }

      router.push(`/series/${slug}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to load series: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Manga URL</label>
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://mangadex.org/title/... or manhwazone.to/series/..."
              disabled={loading}
              autoFocus
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading || !url.trim()}>
            {loading ? "Loading series..." : "Discover series"}
          </Button>
        </form>

        <div className="flex flex-wrap gap-2">
          {SOURCES.map((source) => (
            <Badge key={source.name} variant="outline" className="text-[11px]">
              {source.name}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
