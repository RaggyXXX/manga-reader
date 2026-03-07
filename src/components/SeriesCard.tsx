"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Heart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusSelector";
import { getReadChapters } from "@/lib/reading-progress";
import { imageProxyUrl } from "@/lib/scraper";
import type { MangaSource, ReadingStatus } from "@/lib/manga-store";
import type { SourceNotice } from "@/lib/source-health";
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
  variant?: "grid" | "list";
  sourceNotice?: SourceNotice | null;
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
  variant = "grid",
  sourceNotice,
}: SeriesCardProps) {
  const reduced = useReducedMotion();
  const router = useRouter();
  const readCount = getReadChapters(slug).length;
  const progress = totalChapters > 0 ? Math.min((readCount / totalChapters) * 100, 100) : 0;
  const unreadCount = totalChapters > 0 ? totalChapters - readCount : 0;

  // Long-press handling
  const longPressRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; moved: boolean }>({
    timer: null,
    moved: false,
  });

  const handlePointerDown = () => {
    if (!onLongPress) return;
    longPressRef.current.moved = false;
    longPressRef.current.timer = setTimeout(() => {
      if (!longPressRef.current.moved) onLongPress(slug);
    }, 500);
  };
  const handlePointerMove = () => { longPressRef.current.moved = true; };
  const handlePointerUp = () => {
    if (longPressRef.current.timer) {
      clearTimeout(longPressRef.current.timer);
      longPressRef.current.timer = null;
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (selectable && onSelect) {
      e.preventDefault();
      onSelect(slug);
    }
  };

  const listContent = (
    <div className="flex items-center gap-3 p-2">
      {/* Selection checkbox */}
      {selectable && (
        <div className="flex-shrink-0">
          <div className={`flex h-5 w-5 items-center justify-center rounded border-2 ${
            selected ? "border-primary bg-primary text-primary-foreground" : "border-border"
          }`}>
            {selected && (
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* Cover thumbnail */}
      <div className="h-16 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-muted/40">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageProxyUrl(coverUrl, source)}
            alt={title}
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-muted to-secondary">
            <span className="text-lg font-bold text-muted-foreground/60">{title.charAt(0).toUpperCase()}</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
          {readingStatus && <StatusBadge status={readingStatus} />}
        </div>
        {sourceNotice ? (
          <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-medium ${sourceNotice.tone === "warning" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
            {sourceNotice.title}
          </span>
        ) : null}
        <div className="flex items-center gap-2">
          <Badge variant={readCount > 0 ? "default" : "muted"} className="text-[10px]">
            {readCount > 0 ? `${readCount} / ${totalChapters} Ch.` : `${totalChapters} Ch.`}
          </Badge>
          <span className="text-[10px] text-muted-foreground">{Math.round(progress)}%</span>
          {updateCount != null && updateCount > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              NEW +{updateCount}
            </span>
          )}
          {unreadCount > 0 && (
            <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 py-0.5 text-[10px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={motionOrInstant(!!reduced, 0.35)}
          />
        </div>
      </div>

      {/* Favorite heart */}
      {onToggleFavorite && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFavorite(slug); }}
          className="flex-shrink-0 rounded-full p-1.5 transition-colors hover:bg-muted"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Heart className={`h-4 w-4 ${isFavorite ? "fill-red-500 text-red-500" : "text-muted-foreground"}`} />
        </button>
      )}
    </div>
  );

  const gridContent = (
    <>
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-muted/40">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
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

        {sourceNotice ? (
          <span className={`absolute left-2 top-8 inline-flex max-w-[70%] rounded-full px-2 py-0.5 text-[10px] font-medium shadow ${sourceNotice.tone === "warning" ? "bg-amber-100/95 text-amber-900" : "bg-slate-100/95 text-slate-800"}`}>
            {sourceNotice.title}
          </span>
        ) : null}

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
        onMouseEnter={() => router.prefetch(`/series/${slug}`)}
        onTouchStart={() => router.prefetch(`/series/${slug}`)}
        onContextMenu={(e) => { if (onLongPress) e.preventDefault(); }}
        className={`group relative block overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
          selected ? "ring-2 ring-primary border-primary" : "border-border/70"
        }`}
        style={{ WebkitTouchCallout: "none" } as React.CSSProperties}
      >
        {variant === "list" ? listContent : gridContent}
      </Link>
    </motion.div>
  );
}
