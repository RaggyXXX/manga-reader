"use client";

import { Badge } from "@/components/ui/badge";
import type { MangaSource } from "@/lib/manga-store";
import { imageProxyUrl } from "@/lib/scraper";

const SOURCE_LABELS: Record<MangaSource, string> = {
  mangadex: "MangaDex",
  mangakatana: "MangaKatana",
  manhwazone: "Manhwazone",
  weebcentral: "WeebCentral",
  atsumaru: "Atsumaru",
  mangabuddy: "MangaBuddy",
};

interface FeaturedMangaCardProps {
  title: string;
  coverUrl: string;
  source: MangaSource;
  chapterCount?: number;
  onClick: () => void;
}

export function FeaturedMangaCard({
  title,
  coverUrl,
  source,
  chapterCount,
  onClick,
}: FeaturedMangaCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group overflow-hidden rounded-2xl border border-border/70 bg-card text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
      aria-label={title}
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

        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3">
          <p className="line-clamp-2 text-sm font-semibold text-white">{title}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 p-3">
        <Badge variant="outline" className="bg-background/60 text-[10px]">
          {SOURCE_LABELS[source]}
        </Badge>
        {chapterCount != null && chapterCount > 0 ? (
          <span className="text-xs text-muted-foreground">{chapterCount} ch</span>
        ) : null}
      </div>
    </button>
  );
}
