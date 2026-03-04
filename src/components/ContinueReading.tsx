"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { getProgress, type SeriesProgress } from "@/lib/reading-progress";
import { imageProxyUrl } from "@/lib/scraper";
import type { MangaSource } from "@/lib/manga-store";

interface SeriesInfo {
  slug: string;
  title: string;
  coverUrl: string;
  totalChapters: number;
  source?: MangaSource;
}

interface ContinueReadingItem {
  slug: string;
  title: string;
  coverUrl: string;
  lastReadChapter: number;
  totalChapters: number;
  source?: MangaSource;
  timestamp: number;
}

interface ContinueReadingProps {
  series: SeriesInfo[];
}

export function ContinueReading({ series }: ContinueReadingProps) {
  const router = useRouter();

  const items = useMemo(() => {
    const result: ContinueReadingItem[] = [];

    for (const s of series) {
      const progress: SeriesProgress | null = getProgress(s.slug);
      if (!progress || !progress.lastReadChapter) continue;

      const readCount = progress.readChapters?.length ?? 0;
      if (s.totalChapters > 0 && readCount >= s.totalChapters) continue;

      const timestamp =
        progress.chapterProgress?.[progress.lastReadChapter]?.timestamp ?? 0;

      result.push({
        slug: s.slug,
        title: s.title,
        coverUrl: s.coverUrl,
        lastReadChapter: progress.lastReadChapter,
        totalChapters: s.totalChapters,
        source: s.source,
        timestamp,
      });
    }

    return result.sort((a, b) => b.timestamp - a.timestamp);
  }, [series]);

  if (items.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground md:text-lg">Continue Reading</h2>
      </div>
      <div className="no-scrollbar -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
        {items.map((item, index) => {
          const chapterProgress =
            item.totalChapters > 0
              ? Math.min((item.lastReadChapter / item.totalChapters) * 100, 100)
              : 0;

          const coverSrc = item.coverUrl
            ? imageProxyUrl(item.coverUrl, item.source)
            : undefined;

          return (
            <motion.button
              key={item.slug}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: Math.min(index * 0.04, 0.2) }}
              className="group relative min-h-40 min-w-[72%] snap-start overflow-hidden rounded-2xl border border-border/70 bg-card text-left shadow-sm sm:min-w-[320px]"
              onClick={() => router.push(`/read/${item.slug}/${item.lastReadChapter}`)}
              type="button"
              aria-label={`${item.title} continue reading - chapter ${item.lastReadChapter}`}
            >
              {coverSrc ? (
                <div
                  className="absolute inset-0 bg-cover bg-center opacity-25 blur-[1px] transition-transform duration-300 group-hover:scale-105"
                  style={{ backgroundImage: `url(${coverSrc})` }}
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-tr from-background/95 to-background/60" />
              <div className="relative flex h-full flex-col justify-between p-4">
                <div>
                  <p className="line-clamp-2 text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Chapter {item.lastReadChapter}</p>
                </div>
                <div className="space-y-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${chapterProgress}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{Math.round(chapterProgress)}% read</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
