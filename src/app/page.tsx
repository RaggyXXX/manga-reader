"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowDownUp,
  Filter,
  Heart,
  LayoutGrid,
  LayoutList,
  LibraryBig,
  Plus,
  Search,
  Star,
  X,
} from "lucide-react";
import {
  getAllSeries,
  toggleFavorite,
  updateReadingStatus,
  deleteSeries,
  getLibraryPrefs,
  saveLibraryPrefs,
  type SortOption,
  type ReadingStatus,
  type MangaSource,
  type StoredSeries,
} from "@/lib/manga-store";
import { getProgress } from "@/lib/reading-progress";
import { SeriesCard } from "@/components/SeriesCard";
import { ContinueReading } from "@/components/ContinueReading";
import { StatusSelector } from "@/components/StatusSelector";
import { BatchActionBar } from "@/components/BatchActionBar";
import { Button } from "@/components/ui/button";
import { useSyncContext } from "@/contexts/SyncContext";

const SORT_LABELS: Record<SortOption, string> = {
  last_read: "Last Read",
  recently_added: "Recently Added",
  alphabetical: "A-Z",
  chapter_count: "Chapter Count",
};

const SORT_OPTIONS: SortOption[] = ["last_read", "recently_added", "alphabetical", "chapter_count"];

const SOURCE_LABELS: Record<MangaSource, string> = {
  mangadex: "MangaDex",
  mangakatana: "MangaKatana",
  vymanga: "VyManga",
  manhwazone: "Manhwazone",
};

const STATUS_LABELS: Record<ReadingStatus, string> = {
  reading: "Reading",
  plan_to_read: "Plan to Read",
  completed: "Completed",
  on_hold: "On Hold",
  dropped: "Dropped",
};

export default function LibraryPage() {
  const { updateFlags } = useSyncContext();
  const [series, setSeries] = useState<StoredSeries[]>(() => getAllSeries());
  const [prefs, setPrefs] = useState(() => getLibraryPrefs());
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const viewMode = prefs.viewMode ?? "grid";

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setSearchOpen(false); setSearchQuery(""); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searchOpen]);

  const isEmpty = series.length === 0;

  const refreshSeries = useCallback(() => setSeries(getAllSeries()), []);

  const updatePrefs = useCallback((patch: Partial<typeof prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveLibraryPrefs(next);
  }, [prefs]);

  const handleToggleFavorite = useCallback((slug: string) => {
    toggleFavorite(slug);
    refreshSeries();
  }, [refreshSeries]);

  const handleLongPress = useCallback((slug: string) => {
    setSelectionMode(true);
    setSelectedSlugs(new Set([slug]));
  }, []);

  const handleSelect = useCallback((slug: string) => {
    setSelectedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  }, []);

  const cancelSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedSlugs(new Set());
  }, []);

  const handleBatchDelete = useCallback(() => {
    for (const slug of selectedSlugs) deleteSeries(slug);
    cancelSelection();
    refreshSeries();
  }, [selectedSlugs, cancelSelection, refreshSeries]);

  const handleBatchFavorite = useCallback(() => {
    for (const slug of selectedSlugs) {
      const s = series.find((x) => x.slug === slug);
      if (s && !s.isFavorite) toggleFavorite(slug);
    }
    cancelSelection();
    refreshSeries();
  }, [selectedSlugs, series, cancelSelection, refreshSeries]);

  const handleBatchStatus = useCallback((status: ReadingStatus | undefined) => {
    for (const slug of selectedSlugs) updateReadingStatus(slug, status);
    cancelSelection();
    refreshSeries();
  }, [selectedSlugs, cancelSelection, refreshSeries]);

  // Sort + filter
  const sortedFiltered = useMemo(() => {
    let list = [...series];

    // Filter by source
    if (prefs.filterSource) {
      list = list.filter((s) => (s.source ?? "manhwazone") === prefs.filterSource);
    }
    // Filter by status
    if (prefs.filterStatus) {
      list = list.filter((s) => s.readingStatus === prefs.filterStatus);
    }
    // Filter favorites only
    if (prefs.filterFavoritesOnly) {
      list = list.filter((s) => s.isFavorite);
    }

    // Sort
    switch (prefs.sortBy) {
      case "alphabetical":
        list.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "chapter_count":
        list.sort((a, b) => b.totalChapters - a.totalChapters);
        break;
      case "last_read": {
        list.sort((a, b) => {
          const pa = getProgress(a.slug);
          const pb = getProgress(b.slug);
          const ta = pa ? Math.max(0, ...Object.values(pa.chapterProgress).map((p) => p.timestamp)) : 0;
          const tb = pb ? Math.max(0, ...Object.values(pb.chapterProgress).map((p) => p.timestamp)) : 0;
          return tb - ta;
        });
        break;
      }
      case "recently_added":
      default:
        list.sort((a, b) => b.addedAt - a.addedAt);
        break;
    }

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((s) => s.title.toLowerCase().includes(q));
    }

    // Group favorites at top (unless filtering favorites only)
    if (!prefs.filterFavoritesOnly) {
      const favs = list.filter((s) => s.isFavorite);
      const rest = list.filter((s) => !s.isFavorite);
      return { favorites: favs, rest };
    }
    return { favorites: [], rest: list };
  }, [series, prefs, searchQuery]);

  const hasActiveFilters = !!(prefs.filterSource || prefs.filterStatus || prefs.filterFavoritesOnly);

  return (
    <div className="space-y-7">
      {/* Search overlay */}
      {searchOpen && (
        <div className="fixed inset-x-0 top-0 z-50 border-b border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
            <Search className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search library..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <button
              type="button"
              onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
              className="flex-shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {!isEmpty && (
        <ContinueReading
          series={series.map((s) => ({
            slug: s.slug,
            title: s.title,
            coverUrl: s.coverUrl || "",
            totalChapters: s.totalChapters,
            source: s.source,
          }))}
        />
      )}

      {isEmpty ? (
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: "easeOut" }}
          className="flex min-h-[52vh] flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card/70 px-6 text-center"
        >
          <div className="mb-4 rounded-2xl bg-muted p-4">
            <LibraryBig className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Your library is empty</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Add your first series to cache chapters and continue seamlessly across devices.
          </p>
          <Link href="/add" className="mt-5" data-tour="library-add-empty">
            <Button>
              <Plus className="h-4 w-4" />
              Add Series
            </Button>
          </Link>
        </motion.section>
      ) : (
        <section className="space-y-3">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2" data-tour="library-toolbar">
            {/* Sort dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { setShowSortDropdown((v) => !v); setShowSourceDropdown(false); setShowStatusDropdown(false); }}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/50"
              >
                <ArrowDownUp className="h-3.5 w-3.5" />
                {SORT_LABELS[prefs.sortBy]}
              </button>
              {showSortDropdown && (
                <div className="absolute left-0 z-20 mt-1 min-w-[160px] overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => { updatePrefs({ sortBy: opt }); setShowSortDropdown(false); }}
                      className={`flex w-full items-center px-3 py-2 text-xs transition-colors ${
                        prefs.sortBy === opt ? "bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-muted/50"
                      }`}
                    >
                      {SORT_LABELS[opt]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Source filter */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { setShowSourceDropdown((v) => !v); setShowSortDropdown(false); setShowStatusDropdown(false); }}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/50 ${
                  prefs.filterSource ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-foreground"
                }`}
              >
                <Filter className="h-3.5 w-3.5" />
                {prefs.filterSource ? SOURCE_LABELS[prefs.filterSource] : "Source"}
              </button>
              {showSourceDropdown && (
                <div className="absolute left-0 z-20 mt-1 min-w-[140px] overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                  <button
                    type="button"
                    onClick={() => { updatePrefs({ filterSource: undefined }); setShowSourceDropdown(false); }}
                    className={`flex w-full items-center px-3 py-2 text-xs transition-colors ${
                      !prefs.filterSource ? "bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-muted/50"
                    }`}
                  >
                    All sources
                  </button>
                  {(Object.keys(SOURCE_LABELS) as MangaSource[]).map((src) => (
                    <button
                      key={src}
                      type="button"
                      onClick={() => { updatePrefs({ filterSource: src }); setShowSourceDropdown(false); }}
                      className={`flex w-full items-center px-3 py-2 text-xs transition-colors ${
                        prefs.filterSource === src ? "bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-muted/50"
                      }`}
                    >
                      {SOURCE_LABELS[src]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Status filter */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { setShowStatusDropdown((v) => !v); setShowSortDropdown(false); setShowSourceDropdown(false); }}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/50 ${
                  prefs.filterStatus ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-foreground"
                }`}
              >
                <Star className="h-3.5 w-3.5" />
                {prefs.filterStatus ? STATUS_LABELS[prefs.filterStatus] : "Status"}
              </button>
              {showStatusDropdown && (
                <div className="absolute left-0 z-20 mt-1 min-w-[140px] overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                  <button
                    type="button"
                    onClick={() => { updatePrefs({ filterStatus: undefined }); setShowStatusDropdown(false); }}
                    className={`flex w-full items-center px-3 py-2 text-xs transition-colors ${
                      !prefs.filterStatus ? "bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-muted/50"
                    }`}
                  >
                    All statuses
                  </button>
                  {(Object.keys(STATUS_LABELS) as ReadingStatus[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => { updatePrefs({ filterStatus: st }); setShowStatusDropdown(false); }}
                      className={`flex w-full items-center px-3 py-2 text-xs transition-colors ${
                        prefs.filterStatus === st ? "bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-muted/50"
                      }`}
                    >
                      {STATUS_LABELS[st]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Favorites toggle */}
            <button
              type="button"
              onClick={() => updatePrefs({ filterFavoritesOnly: !prefs.filterFavoritesOnly })}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/50 ${
                prefs.filterFavoritesOnly ? "border-red-400 bg-red-50 text-red-600 dark:bg-red-950/30 dark:border-red-800" : "border-border bg-background text-foreground"
              }`}
              title="Favorites only"
            >
              <Heart className={`h-3.5 w-3.5 ${prefs.filterFavoritesOnly ? "fill-red-500" : ""}`} />
            </button>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => updatePrefs({ filterSource: undefined, filterStatus: undefined, filterFavoritesOnly: false })}
                className="flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            )}

            <div className="ml-auto flex items-center gap-2">
              {/* Search button */}
              <button
                type="button"
                onClick={() => { setSearchOpen(true); setShowSortDropdown(false); setShowSourceDropdown(false); setShowStatusDropdown(false); }}
                className="flex items-center justify-center rounded-lg border border-border bg-background p-1.5 text-foreground transition-colors hover:bg-muted/50"
                title="Search library"
              >
                <Search className="h-3.5 w-3.5" />
              </button>

              {/* View mode toggle */}
              <button
                type="button"
                onClick={() => updatePrefs({ viewMode: viewMode === "grid" ? "list" : "grid" })}
                className="flex items-center justify-center rounded-lg border border-border bg-background p-1.5 text-foreground transition-colors hover:bg-muted/50"
                title={viewMode === "grid" ? "Switch to list view" : "Switch to grid view"}
              >
                {viewMode === "grid" ? <LayoutList className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
              </button>

              <span className="text-xs text-muted-foreground">
                {sortedFiltered.favorites.length + sortedFiltered.rest.length} / {series.length}
              </span>
            </div>
          </div>

          {/* Favorites section */}
          {sortedFiltered.favorites.length > 0 && (
            <div>
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground md:text-lg">
                <Heart className="h-4 w-4 fill-red-500 text-red-500" />
                Favorites
              </h2>
              <div className={viewMode === "grid" ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" : "space-y-2"}>
                {sortedFiltered.favorites.map((s) => (
                  <SeriesCard
                    key={s.slug}
                    slug={s.slug}
                    title={s.title}
                    coverUrl={s.coverUrl}
                    totalChapters={s.totalChapters}
                    source={s.source}
                    isFavorite={s.isFavorite}
                    onToggleFavorite={handleToggleFavorite}
                    readingStatus={s.readingStatus}
                    selectable={selectionMode}
                    selected={selectedSlugs.has(s.slug)}
                    onSelect={selectionMode ? handleSelect : undefined}
                    onLongPress={!selectionMode ? handleLongPress : undefined}
                    updateCount={updateFlags[s.slug]?.newCount}
                    variant={viewMode}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Main series grid */}
          {sortedFiltered.rest.length > 0 && (
            <div>
              {sortedFiltered.favorites.length > 0 && (
                <h2 className="mb-3 text-base font-semibold text-foreground md:text-lg">Your Series</h2>
              )}
              {sortedFiltered.favorites.length === 0 && (
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-base font-semibold text-foreground md:text-lg">Your Series</h2>
                </div>
              )}
              <div className={viewMode === "grid" ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" : "space-y-2"}>
                {sortedFiltered.rest.map((s) => (
                  <SeriesCard
                    key={s.slug}
                    slug={s.slug}
                    title={s.title}
                    coverUrl={s.coverUrl}
                    totalChapters={s.totalChapters}
                    source={s.source}
                    isFavorite={s.isFavorite}
                    onToggleFavorite={handleToggleFavorite}
                    readingStatus={s.readingStatus}
                    selectable={selectionMode}
                    selected={selectedSlugs.has(s.slug)}
                    onSelect={selectionMode ? handleSelect : undefined}
                    onLongPress={!selectionMode ? handleLongPress : undefined}
                    updateCount={updateFlags[s.slug]?.newCount}
                    variant={viewMode}
                  />
                ))}
              </div>
            </div>
          )}

          {sortedFiltered.favorites.length === 0 && sortedFiltered.rest.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card/70 px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">No series match your filters</p>
              <button
                type="button"
                onClick={() => updatePrefs({ filterSource: undefined, filterStatus: undefined, filterFavoritesOnly: false })}
                className="mt-2 text-sm font-medium text-primary hover:underline"
              >
                Clear filters
              </button>
            </div>
          )}
        </section>
      )}

      {selectionMode && (
        <BatchActionBar
          count={selectedSlugs.size}
          onCancel={cancelSelection}
          onDelete={handleBatchDelete}
          onFavorite={handleBatchFavorite}
          onStatusChange={handleBatchStatus}
        />
      )}
    </div>
  );
}
