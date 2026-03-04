"use client";

import type { ComponentType } from "react";
import { BarChart3, BookOpen, Clock3, Database, Download, HelpCircle, Images } from "lucide-react";
import { deleteSeries as deleteStoredSeries, getAllSeries, getChapters } from "@/lib/manga-store";
import { getReadingStats } from "@/lib/reading-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContextBackChevron } from "@/components/navigation/ContextBackChevron";
import { useTour } from "@/contexts/TourContext";
import Link from "next/link";

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return "Unknown";
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} ${days === 1 ? "day" : "days"} ago`;
  if (hours > 0) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  if (minutes > 0) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  return "Just now";
}

function formatReadingTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (remaining === 0) return `${hours} hr`;
  return `${hours} hr ${remaining} min`;
}

export default function StatsPage() {
  const { startTour } = useTour();
  const stats = getReadingStats();
  const allSeries = getAllSeries();

  const seriesList = allSeries.map((s) => ({
    slug: s.slug,
    title: s.title,
    cachedCount: getChapters(s.slug).filter((ch) => ch.imageUrls.length > 0).length,
    totalChapters: s.totalChapters || getChapters(s.slug).length,
  }));

  const hasData = stats.totalChaptersRead > 0;
  const maxChapters = hasData ? Math.max(...stats.seriesStats.map((s) => s.chaptersRead)) : 1;

  const clearSeries = (slug: string) => {
    deleteStoredSeries(slug);
    window.location.reload();
  };

  const clearAll = () => {
    if (!confirm("Delete all cached series data? This cannot be undone.")) return;
    seriesList.forEach((s) => deleteStoredSeries(s.slug));
    window.location.reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ContextBackChevron className="shrink-0" />
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Reading Stats</h1>
        </div>
      </div>

      {hasData ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric icon={BookOpen} label="Chapters Read" value={String(stats.totalChaptersRead)} />
            <Metric icon={Images} label="Pages Viewed" value={String(stats.totalPagesViewed)} />
            <Metric icon={Clock3} label="Reading Time" value={formatReadingTime(stats.estimatedMinutes)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Per Series</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {stats.seriesStats.map((series) => (
                <div key={series.slug} className="rounded-xl border border-border bg-background/80 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="font-medium capitalize">{series.slug.replace(/-/g, " ")}</p>
                    <Badge variant="muted">Ch. {series.lastReadChapter}</Badge>
                  </div>
                  <div className="mb-1 text-xs text-muted-foreground">{series.chaptersRead} chapters read</div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.round((series.chaptersRead / maxChapters) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Last read: {formatRelativeTime(series.lastReadAt)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="font-medium">No reading progress yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Start reading a series to see your stats here.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Offline Storage
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {seriesList.length === 0 ? (
            <p className="text-sm text-muted-foreground">No saved series</p>
          ) : (
            <>
              {seriesList.map((s) => (
                <div key={s.slug} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background/80 p-3">
                  <div>
                    <p className="font-medium">{s.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.cachedCount} / {s.totalChapters} chapters cached
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => clearSeries(s.slug)}>
                    Clear Cache
                  </Button>
                </div>
              ))}
              <Button variant="destructive" onClick={clearAll}>
                Clear All
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <p className="font-medium">App Tour</p>
            <p className="text-sm text-muted-foreground">Learn how to use Manga Blast</p>
          </div>
          <Button variant="outline" size="sm" onClick={startTour}>
            <HelpCircle className="mr-1 h-4 w-4" />
            Start Tour
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <p className="font-medium">How to Install</p>
            <p className="text-sm text-muted-foreground">Add Manga Blast to your home screen</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/install">
              <Download className="mr-1 h-4 w-4" />
              Install Guide
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <Icon className="h-4 w-4 text-primary" />
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
