"use client";

import { motion, useReducedMotion } from "framer-motion";
import { FolderOpen, ChevronRight, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getSeries } from "@/lib/manga-store";
import { imageProxyUrl } from "@/lib/scraper";
import { motionOrInstant } from "@/lib/motion";

interface FolderCardProps {
  id: string;
  name: string;
  childSlugs: string[];
  onClick: () => void;
  onDelete?: () => void;
  jiggling?: boolean;
  variant?: "grid" | "list";
}

/** Resolve up to 4 cover URLs from the child slugs. */
function useChildCovers(childSlugs: string[]): { url: string; source?: string }[] {
  const covers: { url: string; source?: string }[] = [];
  for (const slug of childSlugs.slice(0, 4)) {
    const s = getSeries(slug);
    if (s?.coverUrl) {
      covers.push({ url: imageProxyUrl(s.coverUrl, s.source), source: s.source });
    }
  }
  return covers;
}

export function FolderCard({
  id,
  name,
  childSlugs,
  onClick,
  onDelete,
  jiggling,
  variant = "grid",
}: FolderCardProps) {
  const reduced = useReducedMotion();
  const covers = useChildCovers(childSlugs);

  // ---- List variant ----
  if (variant === "list") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={motionOrInstant(!!reduced, 0.28)}
      >
        <button
          type="button"
          onClick={onClick}
          className="group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-border/70 bg-card p-2 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
        >
          {/* Jiggle delete */}
          {jiggling && onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="absolute left-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white shadow"
              aria-label={`Delete folder ${name}`}
            >
              <X className="h-3 w-3" />
            </button>
          )}

          {/* Folder icon */}
          <div className="flex h-16 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-muted/40">
            <FolderOpen className="h-6 w-6 text-muted-foreground" />
          </div>

          {/* Info */}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h3 className="truncate text-left text-sm font-semibold text-foreground">{name}</h3>
            <Badge variant="muted" className="w-fit text-[10px]">
              {childSlugs.length} {childSlugs.length === 1 ? "series" : "series"}
            </Badge>
          </div>

          {/* Chevron */}
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        </button>
      </motion.div>
    );
  }

  // ---- Grid variant (default) ----
  // Build 4-slot array for the 2x2 mini-grid
  const slots: (string | null)[] = [
    covers[0]?.url ?? null,
    covers[1]?.url ?? null,
    covers[2]?.url ?? null,
    covers[3]?.url ?? null,
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={motionOrInstant(!!reduced, 0.28)}
    >
      <button
        type="button"
        onClick={onClick}
        className="group relative block w-full overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
      >
        {/* Jiggle delete */}
        {jiggling && onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute left-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white shadow"
            aria-label={`Delete folder ${name}`}
          >
            <X className="h-3 w-3" />
          </button>
        )}

        {/* 2x2 mini-grid of covers */}
        <div className="relative aspect-[3/4] w-full overflow-hidden bg-muted/40">
          <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5 p-1">
            {slots.map((url, i) => (
              <div
                key={`${id}-slot-${i}`}
                className="overflow-hidden rounded-lg bg-muted/60"
              >
                {url ? (
                  <img
                    src={url}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-muted/40">
                    <FolderOpen className="h-4 w-4 text-muted-foreground/40" />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Gradient + folder name overlay */}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/65 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-3">
            <h3 className="line-clamp-2 text-sm font-semibold text-white">{name}</h3>
          </div>
        </div>

        {/* Child count badge below image area */}
        <div className="p-3">
          <Badge variant="muted">
            {childSlugs.length} {childSlugs.length === 1 ? "series" : "series"}
          </Badge>
        </div>
      </button>
    </motion.div>
  );
}
