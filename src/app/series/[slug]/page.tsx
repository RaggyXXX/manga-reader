"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BookOpenCheck, CloudDownload, Heart, Play, Share2 } from "lucide-react";
import {
  getChapters,
  getSeries,
  toggleFavorite,
  updateReadingStatus,
  type ReadingStatus,
} from "@/lib/manga-store";
import { getLastReadChapter, getReadChapters } from "@/lib/reading-progress";
import { imageProxyUrl } from "@/lib/scraper";
import { ChapterList } from "@/components/ChapterList";
import { StatusSelector } from "@/components/StatusSelector";
import { DeleteSeriesButton } from "./DeleteSeriesButton";
import { useSyncContext } from "@/contexts/SyncContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ContextBackChevron } from "@/components/navigation/ContextBackChevron";

export default function SeriesPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { phase, slug: syncSlug, startSync, stopSync } = useSyncContext();
  const isSyncing = phase !== "idle" && syncSlug === slug;
  const [refreshTick, setRefreshTick] = useState(0);
  const [favorite, setFavorite] = useState(false);
  const [status, setStatus] = useState<ReadingStatus | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isSyncing) return;
    const id = setInterval(() => setRefreshTick((v) => v + 1), 2000);
    return () => clearInterval(id);
  }, [isSyncing]);

  const series = getSeries(slug);
  const chapters = getChapters(slug);

  // Initialize favorite/status from series data
  useEffect(() => {
    if (series) {
      setFavorite(!!series.isFavorite);
      setStatus(series.readingStatus);
    }
  }, [series?.isFavorite, series?.readingStatus]);

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

  return (
    <div key={refreshTick} className="space-y-4">
      <div className="flex items-center justify-between">
        <ContextBackChevron className="shrink-0" />
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

              <StatusSelector value={status} onChange={handleStatusChange} />

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
                <Button
                  size="sm"
                  variant="secondary"
                  type="button"
                  data-tour="series-sync"
                  onClick={() => (isSyncing ? stopSync() : startSync(slug))}
                >
                  {isSyncing ? "Stop sync" : "Sync chapters"}
                </Button>
                {!isSyncing && !isFullySynced && chapters.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() => startSync(slug)}
                    title="Download all chapters for offline reading"
                  >
                    <CloudDownload className="mr-1 h-4 w-4" />
                    Download for offline
                  </Button>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Chapter management and reading progress stay local. Reader behavior remains unchanged.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <ChapterList key={slug} chapters={chaptersPlain} seriesSlug={slug} />
    </div>
  );
}
