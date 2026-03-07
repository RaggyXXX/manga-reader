"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { discoverSeries, imageProxyUrl } from "@/lib/scraper";
import { getAllSeries, saveSeries, type MangaSource } from "@/lib/manga-store";
import { PreviewModal } from "@/components/PreviewModal";

export default function SharePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const url = searchParams.get("url");
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<{
    title: string;
    coverUrl: string;
    sourceUrl: string;
    source: MangaSource;
    sourceId?: string;
  } | null>(null);
  const [adding, setAdding] = useState(false);
  const loading = !!url && !error && !previewData;

  useEffect(() => {
    if (!url) return;

    void (async () => {
      const existing = await getAllSeries();
      const duplicate = existing.find((s) => s.sourceUrl === url);
      if (duplicate) {
        router.replace(`/series/${duplicate.slug}`);
        return;
      }

      discoverSeries(url)
        .then((discovered) => {
          setPreviewData({
            title: discovered.title,
            coverUrl: discovered.coverUrl,
            sourceUrl: discovered.sourceUrl,
            source: discovered.source,
            sourceId: discovered.sourceId,
          });
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Failed to load series");
        });
    })();
  }, [url, router]);

  const handleAdd = async (preferredLanguage?: string) => {
    if (!previewData) return;
    setAdding(true);

    try {
      const discovered = await discoverSeries(previewData.sourceUrl);
      const slug = discovered.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      await saveSeries({
        slug,
        title: discovered.title,
        coverUrl: discovered.coverUrl,
        sourceUrl: discovered.sourceUrl,
        totalChapters: 0,
        addedAt: Date.now(),
        source: discovered.source,
        sourceId: discovered.sourceId,
        ...(preferredLanguage ? { preferredLanguage } : {}),
      });

      // Pre-cache cover image
      if (discovered.coverUrl) {
        fetch(imageProxyUrl(discovered.coverUrl, discovered.source)).catch(() => {});
      }

      router.push(`/series/${slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add series");
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center space-y-3">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading series...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm text-destructive">{error}</p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="text-sm text-primary underline"
          >
            Go to Library
          </button>
        </div>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm text-destructive">No URL provided</p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="text-sm text-primary underline"
          >
            Go to Library
          </button>
        </div>
      </div>
    );
  }

  if (previewData) {
    return (
      <PreviewModal
        data={previewData}
        onAdd={handleAdd}
        onClose={() => router.push("/")}
        adding={adding}
      />
    );
  }

  return null;
}
