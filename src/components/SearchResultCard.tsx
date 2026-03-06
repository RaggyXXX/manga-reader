"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { MangaSource } from "@/lib/manga-store";
import { motionOrInstant } from "@/lib/motion";

const SOURCE_COLORS: Record<MangaSource, string> = {
  mangadex: "#ff6740",
  mangakatana: "#4a90d9",
  manhwazone: "#e8a849",
  weebcentral: "#7c3aed",
  atsumaru: "#10b981",
  mangabuddy: "#f43f5e",
};

const SOURCE_LABELS: Record<MangaSource, string> = {
  mangadex: "MangaDex",
  mangakatana: "MangaKatana",
  manhwazone: "Manhwazone",
  weebcentral: "WeebCentral",
  atsumaru: "Atsumaru",
  mangabuddy: "MangaBuddy",
};

const PRIORITY_LANGS = ["en", "de", "fr", "es", "ja", "ko"];

interface SearchResultCardProps {
  title: string;
  coverUrl: string;
  source: MangaSource;
  chapterCount?: number;
  availableLanguages?: string[];
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function SearchResultCard({
  title,
  coverUrl,
  source,
  chapterCount,
  availableLanguages,
  loading,
  disabled,
  onClick,
}: SearchResultCardProps) {
  const reduced = useReducedMotion();
  const sortedLangs = availableLanguages
    ? [...availableLanguages].sort((a, b) => {
        const ai = PRIORITY_LANGS.indexOf(a);
        const bi = PRIORITY_LANGS.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.localeCompare(b);
      })
    : [];

  const imgSrc =
    coverUrl && source === "mangadex"
      ? `/api/mangadex/img?url=${encodeURIComponent(coverUrl)}`
      : coverUrl;

  return (
    <motion.button
      whileHover={{ y: -2 }}
      transition={motionOrInstant(!!reduced, 0.15)}
      className="group relative flex w-full items-start gap-3 overflow-hidden rounded-2xl border border-border/70 bg-card p-3 text-left shadow-sm transition-colors hover:bg-card/80 disabled:cursor-not-allowed disabled:opacity-60"
      onClick={onClick}
      disabled={disabled || loading}
      type="button"
    >
      {imgSrc ? (
        <img
          src={imgSrc}
          alt={title}
          className="h-24 w-16 rounded-md object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="flex h-24 w-16 items-center justify-center rounded-md bg-muted text-lg font-semibold text-muted-foreground">
          {title.charAt(0).toUpperCase()}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-semibold text-foreground">{title}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1.5 border-border bg-background/60 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ background: SOURCE_COLORS[source] }} />
            {SOURCE_LABELS[source]}
          </Badge>
          {chapterCount != null && chapterCount > 0 ? (
            <Badge variant="muted" className="text-[10px]">
              {chapterCount} ch
            </Badge>
          ) : null}
          {sortedLangs.slice(0, 4).map((lang) => (
            <Badge key={lang} variant="muted" className="text-[10px]">
              {lang.toUpperCase()}
            </Badge>
          ))}
          {sortedLangs.length > 4 ? (
            <Badge variant="muted" className="text-[10px]">
              +{sortedLangs.length - 4}
            </Badge>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-[1px]">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : null}
    </motion.button>
  );
}
