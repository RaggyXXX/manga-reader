"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { getProgress } from "@/lib/reading-progress";
import { imageProxyUrl } from "@/lib/scraper";
import type { MangaSource, StoredSeries } from "@/lib/manga-store";

interface QuickContinueProps {
  series: StoredSeries[];
}

export function QuickContinue({ series }: QuickContinueProps) {
  const router = useRouter();

  const item = useMemo(() => {
    let best: {
      slug: string;
      title: string;
      coverUrl: string;
      source?: MangaSource;
      chapter: number;
      page: number;
      timestamp: number;
    } | null = null;

    for (const s of series) {
      const progress = getProgress(s.slug);
      if (!progress || !progress.lastReadChapter) continue;

      // Find the most recent timestamp across all chapter progress entries
      let latestTimestamp = 0;
      let latestChapter = progress.lastReadChapter;
      let latestPage = 0;

      for (const [chNum, pos] of Object.entries(progress.chapterProgress)) {
        if (pos.timestamp > latestTimestamp) {
          latestTimestamp = pos.timestamp;
          latestChapter = Number(chNum);
          latestPage = pos.imageIndex;
        }
      }

      if (latestTimestamp > 0 && (!best || latestTimestamp > best.timestamp)) {
        best = {
          slug: s.slug,
          title: s.title,
          coverUrl: s.coverUrl || "",
          source: s.source,
          chapter: latestChapter,
          page: latestPage,
          timestamp: latestTimestamp,
        };
      }
    }

    return best;
  }, [series]);

  if (!item) return null;

  const coverSrc = item.coverUrl
    ? imageProxyUrl(item.coverUrl, item.source)
    : undefined;

  return (
    <button
      type="button"
      onClick={() => router.push(`/read/${item.slug}/${item.chapter}`)}
      className="group relative flex h-20 w-full items-center overflow-hidden rounded-2xl border border-border/70 bg-card text-left shadow-sm transition-shadow hover:shadow-md"
      aria-label={`Continue reading ${item.title} - Chapter ${item.chapter}`}
      data-tour="library-quick-continue"
    >
      {/* Cover image with fade mask */}
      {coverSrc && (
        <div
          className="absolute inset-y-0 left-0 w-[220px] bg-cover bg-center"
          style={{
            backgroundImage: `url(${coverSrc})`,
            maskImage:
              "linear-gradient(to right, black 60px, transparent 220px)",
            WebkitMaskImage:
              "linear-gradient(to right, black 60px, transparent 220px)",
          }}
        />
      )}

      {/* Semi-transparent overlay for text readability */}
      <div className="absolute inset-0 bg-card/60" />

      {/* Content */}
      <div className="relative flex w-full items-center gap-3 px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">
            {item.title}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Chapter {item.chapter}
            {item.page > 0 ? `, Page ${item.page + 1}` : ""}
          </p>
        </div>

        {/* Play button */}
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform group-hover:scale-110">
          <Play className="h-4 w-4 fill-current" />
        </div>
      </div>
    </button>
  );
}
