"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, BookOpenCheck, CloudDownload } from "lucide-react";
import { getChapters, getSeries } from "@/lib/manga-store";
import { imageProxyUrl } from "@/lib/scraper";
import { ChapterList } from "@/components/ChapterList";
import { DeleteSeriesButton } from "./DeleteSeriesButton";
import { useSyncContext } from "@/contexts/SyncContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function SeriesPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { phase, slug: syncSlug } = useSyncContext();
  const isSyncing = phase !== "idle" && syncSlug === slug;
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!isSyncing) return;
    const id = setInterval(() => setRefreshTick((v) => v + 1), 2000);
    return () => clearInterval(id);
  }, [isSyncing]);

  const series = getSeries(slug);
  const chapters = getChapters(slug);

  if (!series) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <p className="mb-4 text-sm text-muted-foreground">Serie nicht gefunden.</p>
        <Link href="/">
          <Button>Zur Bibliothek</Button>
        </Link>
      </div>
    );
  }

  const syncedCount = chapters.filter((ch) => ch.imageUrls.length > 0).length;
  const chaptersPlain = chapters.map((ch) => ({
    number: ch.number,
    title: ch.title,
    status: ch.imageUrls.length > 0 ? "crawled" : "pending",
    pageCount: ch.imageUrls.length,
  }));

  return (
    <div key={refreshTick} className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Zurueck
          </Button>
        </Link>
        <DeleteSeriesButton seriesSlug={slug} seriesTitle={series.title} />
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0 sm:p-0">
          <div className="grid gap-4 p-4 sm:grid-cols-[180px_1fr]">
            <div className="overflow-hidden rounded-xl border border-border bg-muted/40">
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
              <h1 className="text-2xl font-bold tracking-tight">{series.title}</h1>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  <BookOpenCheck className="mr-1 h-3.5 w-3.5" />
                  {series.totalChapters || chapters.length} Kapitel
                </Badge>
                <Badge variant="secondary">
                  <CloudDownload className="mr-1 h-3.5 w-3.5" />
                  {syncedCount} bereit
                </Badge>
                {isSyncing ? <Badge>Sync laeuft</Badge> : null}
              </div>
              <p className="text-sm text-muted-foreground">
                Kapitelverwaltung und Lesefortschritt sind komplett lokal. Die Reader-Funktionalitaet bleibt unveraendert.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <ChapterList key={slug} chapters={chaptersPlain} seriesSlug={slug} />
    </div>
  );
}
