"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { getReadChapters } from "@/lib/reading-progress";
import { imageProxyUrl } from "@/lib/scraper";
import type { MangaSource } from "@/lib/manga-store";

interface SeriesCardProps {
  slug: string;
  title: string;
  coverUrl?: string;
  totalChapters: number;
  source?: MangaSource;
}

export function SeriesCard({
  slug,
  title,
  coverUrl,
  totalChapters,
  source,
}: SeriesCardProps) {
  const readCount = getReadChapters(slug).length;
  const progress = totalChapters > 0 ? Math.min((readCount / totalChapters) * 100, 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      <Link
        href={`/series/${slug}`}
        className="group relative block overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
      >
        <div className="relative aspect-[3/4] w-full overflow-hidden bg-muted/40">
          {coverUrl ? (
            <img
              src={imageProxyUrl(coverUrl, source)}
              alt={title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-muted to-secondary">
              <span className="text-4xl font-bold text-muted-foreground/60">
                {title.charAt(0).toUpperCase()}
              </span>
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/65 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-3">
            <h3 className="line-clamp-2 text-sm font-semibold text-white">{title}</h3>
          </div>
        </div>

        <div className="space-y-2 p-3">
          <div className="flex items-center justify-between">
            <Badge variant={readCount > 0 ? "default" : "muted"}>
              {readCount > 0 ? `${readCount} / ${totalChapters} Kap.` : `${totalChapters} Kap.`}
            </Badge>
            <span className="text-xs text-muted-foreground">{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
