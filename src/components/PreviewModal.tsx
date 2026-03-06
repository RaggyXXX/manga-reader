"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MangaSource } from "@/lib/manga-store";
import { motionOrInstant } from "@/lib/motion";

const SOURCE_LABELS: Record<MangaSource, string> = {
  mangadex: "MangaDex",
  mangakatana: "MangaKatana",
  manhwazone: "Manhwazone",
  weebcentral: "WeebCentral",
  atsumaru: "Atsumaru",
  mangabuddy: "MangaBuddy",
};

const STATUS_COLORS: Record<string, string> = {
  Completed: "bg-emerald-100 text-emerald-800",
  Ongoing: "bg-amber-100 text-amber-800",
  Hiatus: "bg-rose-100 text-rose-800",
  Cancelled: "bg-zinc-200 text-zinc-700",
};

interface PreviewData {
  title: string;
  coverUrl: string;
  sourceUrl: string;
  source: MangaSource;
  sourceId?: string;
}

interface PreviewMeta {
  title: string;
  altTitles: string[];
  description: string;
  status: string;
  author: string;
  artist: string;
  genres: string[];
  themes: string[];
  formats: string[];
  chapterCount: number;
  year: number | null;
  coverUrl: string;
  availableLanguages: string[];
  originalLanguage: string;
  contentRating: string;
  demographic: string;
  type: string;
}

interface PreviewModalProps {
  data: PreviewData;
  onAdd: (preferredLanguage?: string) => void;
  onClose: () => void;
  adding: boolean;
}

export function PreviewModal({ data, onAdd, onClose, adding }: PreviewModalProps) {
  const reduced = useReducedMotion();
  const [meta, setMeta] = useState<PreviewMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLang, setSelectedLang] = useState<string>("en");
  const [langLoading, setLangLoading] = useState(false);

  const isMangaDex = data.source === "mangadex";
  const needsProxy = data.source === "atsumaru" || data.source === "mangabuddy";
  const imgSrc = useMemo(() => {
    if (!data.coverUrl) return "";
    if (isMangaDex) return `/api/mangadex/img?url=${encodeURIComponent(data.coverUrl)}`;
    if (needsProxy) return `/api/proxy?url=${encodeURIComponent(data.coverUrl)}`;
    return data.coverUrl;
  }, [data.coverUrl, isMangaDex, needsProxy]);

  useEffect(() => {
    let cancelled = false;

    async function fetchMeta() {
      try {
        const params = new URLSearchParams({
          url: data.sourceUrl,
          source: data.source,
        });
        if (data.sourceId) params.set("sourceId", data.sourceId);
        const resp = await fetch(`/api/preview?${params}`);
        if (!cancelled && resp.ok) {
          const m: PreviewMeta = await resp.json();
          setMeta(m);
          if (m.availableLanguages?.length > 0) {
            setSelectedLang(m.availableLanguages.includes("en") ? "en" : m.availableLanguages[0]);
          }
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchMeta();
    return () => {
      cancelled = true;
    };
  }, [data.source, data.sourceId, data.sourceUrl]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleLangChange = async (lang: string) => {
    if (lang === selectedLang) return;
    setSelectedLang(lang);

    if (!isMangaDex || !data.sourceId) return;

    setLangLoading(true);
    try {
      const params = new URLSearchParams({
        url: data.sourceUrl,
        source: data.source,
        lang,
      });
      if (data.sourceId) params.set("sourceId", data.sourceId);

      const resp = await fetch(`/api/preview?${params}`);
      if (resp.ok) {
        const updated: PreviewMeta = await resp.json();
        setMeta((prev) => (prev ? { ...prev, chapterCount: updated.chapterCount } : prev));
      }
    } catch {
      // ignore
    } finally {
      setLangLoading(false);
    }
  };

  const displayCover = meta?.coverUrl
    ? data.source === "mangadex"
      ? `/api/mangadex/img?url=${encodeURIComponent(meta.coverUrl)}`
      : needsProxy
        ? `/api/proxy?url=${encodeURIComponent(meta.coverUrl)}`
        : meta.coverUrl
    : imgSrc;

  return (
    <div className="fixed inset-0 z-[90] bg-black/45 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-[2px]" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={motionOrInstant(!!reduced, 0.2)}
        className="mx-auto flex h-[calc(100dvh-max(0.75rem,env(safe-area-inset-top))-0.75rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-lg font-semibold">{meta?.title || data.title}</p>
              <p className="text-xs text-muted-foreground">{SOURCE_LABELS[data.source]}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-500 transition-colors hover:bg-red-500/10"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
            <div className="overflow-hidden rounded-xl border border-border bg-muted/40">
              {displayCover ? (
                <img src={displayCover} alt={data.title} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="flex h-[210px] items-center justify-center text-3xl text-muted-foreground">
                  {data.title.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {meta?.status ? (
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[meta.status] ?? "bg-muted text-muted-foreground"}`}
                  >
                    {meta.status}
                  </span>
                ) : null}
                {meta?.type ? <Badge variant="outline">{meta.type}</Badge> : null}
                {meta?.contentRating && meta.contentRating !== "safe" ? <Badge variant="secondary">{meta.contentRating}</Badge> : null}
                {meta?.demographic ? <Badge variant="muted">{meta.demographic}</Badge> : null}
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <Info label="Chapters" value={loading || langLoading ? "..." : String(meta?.chapterCount ?? "-")} />
                <Info label="Year" value={loading ? "..." : String(meta?.year ?? "-")} />
                <Info label="Author" value={loading ? "..." : (meta?.author || "-")} />
                <Info label="Artist" value={loading ? "..." : (meta?.artist || "-")} />
              </div>
            </div>
          </div>

          {meta?.availableLanguages?.length ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Languages</p>
              <div className="flex flex-wrap gap-2">
                {meta.availableLanguages.map((lang) => {
                  const active = lang === selectedLang;
                  return (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => (isMangaDex && meta.availableLanguages.length > 1 ? handleLangChange(lang) : undefined)}
                      disabled={langLoading}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {lang.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {meta?.genres?.length ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Genres</p>
              <div className="flex flex-wrap gap-2">
                {meta.genres.map((genre) => (
                  <Badge key={genre} variant="secondary">{genre}</Badge>
                ))}
              </div>
            </div>
          ) : null}

          {meta?.description ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</p>
              <p className="text-sm leading-6 text-foreground/90">{meta.description}</p>
            </div>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">Loading metadata...</p>
          ) : null}
        </div>

        <div className="border-t border-border p-4">
          <Button
            type="button"
            className="w-full"
            disabled={adding || langLoading}
            onClick={() => onAdd(isMangaDex ? selectedLang : undefined)}
          >
            {adding ? "Adding..." : "Add Series"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/70 p-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 line-clamp-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
