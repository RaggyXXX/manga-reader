"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Heart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusSelector";
import { getReadChapters } from "@/lib/reading-progress";
import { imageProxyUrl } from "@/lib/scraper";
import type { MangaSource, ReadingStatus } from "@/lib/manga-store";
import { motionOrInstant } from "@/lib/motion";

interface SeriesCardProps {
  slug: string;
  title: string;
  coverUrl?: string;
  totalChapters: number;
  source?: MangaSource;
  isFavorite?: boolean;
  onToggleFavorite?: (slug: string) => void;
  readingStatus?: ReadingStatus;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (slug: string) => void;
  onLongPress?: (slug: string) => void;
  updateCount?: number;
}

export function SeriesCard({
  slug,
  title,
  coverUrl,
  totalChapters,
  source,
  isFavorite,
  onToggleFavorite,
  readingStatus,
  selectable,
  selected,
  onSelect,
  onLongPress,
  updateCount,
}: SeriesCardProps) {
  const reduced = useReducedMotion();
  const readCount = getReadChapters(slug).length;
  const progress = totalChapters > 0 ? Math.min((readCount / totalChapters) * 100, 100) : 0;
  const unreadCount = totalChapters > 0 ? totalChapters - readCount : 0;

  // Long-press handling
  const longPressRef = { timer: null as ReturnType<typeof setTimeout> | null, moved: false };

  const handlePointerDown = () => {
    if (!onLongPress) return;
    longPressRef.moved = false;
    longPressRef.timer = setTimeout(() => {
      if (!longPressRef.moved) onLongPress(slug);
    }, 500);
  };
  const handlePointerMove = () => { longPressRef.moved = true; };
  const handlePointerUp = () => {
    if (longPressRef.timer) clearTimeout(longPressRef.timer);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (selectable && onSelect) {
      e.preventDefault();
      onSelect(slug);
    }
  };

  const cardContent = (
    <>
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

        {/* Unread badge - top left */}
        {unreadCount > 0 && (
          <span className="absolute left-2 top-2 inline-flex min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}

        {/* Favorite heart - top right */}
        {onToggleFavorite && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFavorite(slug); }}
            className="absolute right-2 top-2 rounded-full bg-black/40 p-1.5 transition-colors hover:bg-black/60"
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Heart className={`h-4 w-4 ${isFavorite ? "fill-red-500 text-red-500" : "text-white"}`} />
          </button>
        )}

        {/* Selection checkbox */}
        {selectable && (
          <div className="absolute left-2 top-2">
            <div className={`flex h-5 w-5 items-center justify-center rounded border-2 ${
              selected ? "border-primary bg-primary text-primary-foreground" : "border-white bg-black/40"
            }`}>
              {selected && (
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          </div>
        )}

        {/* Status badge - bottom left above title */}
        {readingStatus && (
          <div className="absolute left-2 bottom-10">
            <StatusBadge status={readingStatus} />
          </div>
        )}

        {/* Update available badge - bottom right above title gradient */}
        {updateCount != null && updateCount > 0 && (
          <span className="absolute right-2 bottom-10 inline-flex items-center gap-0.5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
            NEW +{updateCount}
          </span>
        )}
      </div>

      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between">
          <Badge variant={readCount > 0 ? "default" : "muted"}>
            {readCount > 0 ? `${readCount} / ${totalChapters} Ch.` : `${totalChapters} Ch.`}
          </Badge>
          <span className="text-xs text-muted-foreground">{Math.round(progress)}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={motionOrInstant(!!reduced, 0.35)}
          />
        </div>
      </div>
    </>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={motionOrInstant(!!reduced, 0.28)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <Link
        href={`/series/${slug}`}
        onClick={handleClick}
        className={`group relative block overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
          selected ? "ring-2 ring-primary border-primary" : "border-border/70"
        }`}
      >
        {cardContent}
      </Link>
    </motion.div>
  );
}
