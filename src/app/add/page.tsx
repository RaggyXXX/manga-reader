"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LinkIcon, Search, Sparkles } from "lucide-react";
import { discoverSeries, detectSource } from "@/lib/scraper";
import { getAllSeries, saveSeries, type MangaSource } from "@/lib/manga-store";
import { SearchResultCard } from "@/components/SearchResultCard";
import { PreviewModal } from "@/components/PreviewModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  { key: "all", label: "Alle", color: "#b57f44" },
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
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Serie hinzufuegen</h1>
          <p className="text-sm text-muted-foreground">Suche plattformuebergreifend oder fuege per URL hinzu.</p>
        </div>
        <Link href="/">
          <Button variant="outline" size="sm">Zurueck</Button>
        </Link>
      </header>

      <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
        <TabsList>
          <TabsTrigger value="search">
            <span className="inline-flex items-center gap-2"><Search className="h-4 w-4" /> Suche</span>
          </TabsTrigger>
          <TabsTrigger value="url">
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

      <Card>
        <CardContent className="p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unterstuetzte Quellen</p>
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
        </CardContent>
      </Card>
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
  const [preview, setPreview] = useState<SearchResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

      saveSeries({
        slug,
        title: discovered.title,
        coverUrl: discovered.coverUrl,
        sourceUrl: discovered.sourceUrl,
        totalChapters: 0,
        addedAt: Date.now(),
        source: discovered.source,
        sourceId: discovered.sourceId,
        ...(preferredLanguage ? { preferredLanguage } : {}),
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
              placeholder="Manga suchen..."
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="sticky top-[4.25rem] z-20 -mx-1 flex flex-wrap gap-2 rounded-xl border border-border/70 bg-card/95 px-1 py-1 backdrop-blur">
            {SOURCE_FILTERS.map((sf) => (
              <button
                key={sf.key}
                type="button"
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  sourceFilter === sf.key
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setSourceFilter(sf.key)}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: sf.color }} />
                {sf.label}
              </button>
            ))}
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {partialErrors.length > 0 ? (
            <p className="text-xs text-amber-700">Einige Quellen nicht erreichbar: {partialErrors.join(", ")}</p>
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
            Keine Ergebnisse gefunden
          </CardContent>
        </Card>
      ) : null}

      {!searching && filtered.length > 0 ? (
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
      ) : null}

      {!searching && !searched && query.trim().length > 0 && query.trim().length < 2 ? (
        <p className="text-sm text-muted-foreground">Mindestens 2 Zeichen eingeben</p>
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
    <Card>
      <CardContent className="space-y-3 p-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Manga URL</label>
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://mangadex.org/title/... oder manhwazone.to/series/..."
              disabled={loading}
              autoFocus
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading || !url.trim()}>
            {loading ? "Serie wird geladen..." : "Serie entdecken"}
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
