"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BookOpenCheck, CloudDownload, Heart, Loader2, Play, Share2 } from "lucide-react";
import {
  getChapters,
  getSeries,
  toggleFavorite,
  updateReadingStatus,
  type ReadingStatus,
  type StoredSeries,
  type StoredChapter,
} from "@/lib/manga-store";
import { getLastReadChapter, getReadChapters } from "@/lib/reading-progress";
import { imageProxyUrl } from "@/lib/scraper";
import { checkForUpdates } from "@/lib/update-checker";
import { ChapterList } from "@/components/ChapterList";
import { StatusSelector } from "@/components/StatusSelector";
import { DeleteSeriesButton } from "./DeleteSeriesButton";
import { useSyncContext } from "@/contexts/SyncContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function SeriesPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { phase, slug: syncSlug, startSync, stopSync, completed, total, clearUpdateFlag } = useSyncContext();
  const isSyncing = phase !== "idle" && syncSlug === slug;

  const [series, setSeries] = useState<StoredSeries | null>(() => getSeries(slug));
  const [chapters, setChapters] = useState<StoredChapter[]>(() => getChapters(slug));
  const [favorite, setFavorite] = useState(false);
  const [status, setStatus] = useState<ReadingStatus | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const [checking, setChecking] = useState(false);

  // Refresh chapter data during sync (without remounting cover)
  useEffect(() => {
    if (!isSyncing) return;
    const id = setInterval(() => {
      setSeries(getSeries(slug));
      setChapters(getChapters(slug));
    }, 2000);
    return () => clearInterval(id);
  }, [isSyncing, slug]);

  // Also refresh once when sync ends
  useEffect(() => {
    if (!isSyncing) {
      setSeries(getSeries(slug));
      setChapters(getChapters(slug));
    }
  }, [isSyncing, slug]);

  // Initialize favorite/status from series data
  useEffect(() => {
    if (series) {
      setFavorite(!!series.isFavorite);
      setStatus(series.readingStatus);
    }
  }, [series?.isFavorite, series?.readingStatus]);

  // Auto-check for updates on mount + clear update flag
  useEffect(() => {
    if (!series) return;
    clearUpdateFlag?.(slug);
    let cancelled = false;
    setChecking(true);
    checkForUpdates(series).then((count) => {
      if (!cancelled) {
        setNewCount(count);
        setChecking(false);
      }
    }).catch(() => {
      if (!cancelled) setChecking(false);
    });
    return () => { cancelled = true; };
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!series) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <p className="mb-4 text-sm text-muted-foreground">Series not found.</p>
        <Link href="/">
          <Button>Open Library</Button>
        </Link>
      </div>
    );
  }

  const syncedCount = chapters.filter((ch) => ch.imageUrls.length > 0).length;
  const chapterNumbers = chapters.map((ch) => ch.number).sort((a, b) => a - b);
  const lastRead = getLastReadChapter(slug);
  const readSet = new Set(getReadChapters(slug));
  const nextUnread = chapterNumbers.find((n) => !readSet.has(n)) ?? null;
  const continueChapter = nextUnread ?? lastRead ?? (chapterNumbers[0] ?? null);
  const isFullySynced = syncedCount > 0 && syncedCount >= chapters.length;
  const hasChaptersSynced = syncedCount > 0;
  const chaptersPlain = chapters.map((ch) => ({
    number: ch.number,
    title: ch.title,
    status: ch.imageUrls.length > 0 ? "crawled" : "pending",
    pageCount: ch.imageUrls.length,
  }));

  const handleToggleFavorite = () => {
    const newVal = toggleFavorite(slug);
    setFavorite(newVal);
  };

  const handleStatusChange = (newStatus: ReadingStatus | undefined) => {
    updateReadingStatus(slug, newStatus);
    setStatus(newStatus);
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/share?url=${encodeURIComponent(series.sourceUrl)}&source=${series.source || "manhwazone"}${series.sourceId ? `&sourceId=${series.sourceId}` : ""}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: series.title, url: shareUrl });
      } catch {
        // User cancelled or share failed silently
      }
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSyncClick = () => {
    if (isSyncing) {
      stopSync();
    } else {
      setNewCount(0);
      startSync(slug);
    }
  };

  // Determine bottom button state
  const getButtonState = () => {
    if (isSyncing) {
      const progress = total > 0 ? `${completed}/${total}` : "...";
      return { label: `Syncing... ${progress}`, icon: <Loader2 className="mr-2 h-5 w-5 animate-spin" />, suffix: <span className="ml-2 text-xs opacity-80">Tap to stop</span>, disabled: false, enabled: true };
    }
    if (!hasChaptersSynced) {
      return { label: "Download all", icon: <CloudDownload className="mr-2 h-5 w-5" />, suffix: null, disabled: false, enabled: true };
    }
    if (newCount > 0) {
      return { label: "Update", icon: <CloudDownload className="mr-2 h-5 w-5" />, suffix: <span className="ml-2 rounded bg-white/20 px-1.5 py-0.5 text-[11px] font-bold">+{newCount} new</span>, disabled: false, enabled: true };
    }
    return { label: "No updates", icon: <CloudDownload className="mr-2 h-5 w-5" />, suffix: checking ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null, disabled: true, enabled: false };
  };

  const btn = getButtonState();

  return (
    <div className="space-y-4 pb-28 md:pb-4">
      <div className="flex items-center justify-end">
        <DeleteSeriesButton seriesSlug={slug} seriesTitle={series.title} />
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0 sm:p-0">
          <div className="grid gap-4 p-4 sm:grid-cols-[180px_1fr]">
            <div className="mx-auto max-h-[280px] w-auto overflow-hidden rounded-xl border border-border bg-muted/40 sm:max-h-none sm:w-full">
              {series.coverUrl ? (
                <img
                  src={imageProxyUrl(series.coverUrl, series.source)}
                  alt={series.title}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex min-h-[240px] items-center justify-center text-4xl text-muted-foreground">□</div>
              )}
            </div>
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <h1 className="flex-1 text-2xl font-bold tracking-tight">{series.title}</h1>
                <div className="flex shrink-0 gap-1" data-tour="series-share-fav">
                  <button
                    type="button"
                    onClick={handleShare}
                    className="shrink-0 rounded-lg border border-border p-2 transition-colors hover:bg-muted/50"
                    aria-label={copied ? "Copied!" : "Share series"}
                    title={copied ? "Copied!" : "Share series"}
                  >
                    <Share2 className={`h-5 w-5 ${copied ? "text-primary" : "text-muted-foreground"}`} />
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleFavorite}
                    className="shrink-0 rounded-lg border border-border p-2 transition-colors hover:bg-muted/50"
                    aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
                  >
                    <Heart className={`h-5 w-5 ${favorite ? "fill-red-500 text-red-500" : "text-muted-foreground"}`} />
                  </button>
                </div>
              </div>

              <div data-tour="series-reading-status">
                <StatusSelector value={status} onChange={handleStatusChange} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  <BookOpenCheck className="mr-1 h-3.5 w-3.5" />
                  {series.totalChapters || chapters.length} Chapters
                </Badge>
                <Badge variant="secondary">
                  <CloudDownload className="mr-1 h-3.5 w-3.5" />
                  {syncedCount} ready
                </Badge>
                {isSyncing ? <Badge>Sync in progress</Badge> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {continueChapter != null ? (
                  <Link href={`/read/${slug}/${continueChapter}`}>
                    <Button size="sm">
                      <Play className="mr-1 h-4 w-4" />
                      Continue Reading
                    </Button>
                  </Link>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">
                Chapter management and reading progress stay local. Reader behavior remains unchanged.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <ChapterList key={slug} chapters={chaptersPlain} seriesSlug={slug} />

      {/* Fixed bottom sync bar — flush above mobile nav, same full width */}
      <div
        style={{ bottom: "calc(49px + var(--sab, 0px))" }}
        className={`fixed inset-x-0 z-40 border-t md:relative md:!bottom-auto md:mt-4 md:rounded-xl md:border-t-0 ${
          btn.enabled
            ? "border-primary/30 bg-primary text-primary-foreground"
            : "border-border/40 bg-muted/80 text-muted-foreground"
        }`}
        data-tour="series-sync"
      >
        <button
          type="button"
          disabled={btn.disabled}
          onClick={handleSyncClick}
          className={`flex w-full items-center justify-center px-3 py-3.5 text-sm font-semibold transition-colors md:rounded-xl ${
            btn.enabled
              ? "hover:bg-primary/90 active:bg-primary/80"
              : "cursor-not-allowed opacity-60"
          }`}
        >
          {btn.icon}
          {btn.label}
          {btn.suffix}
        </button>
      </div>
    </div>
  );
}
