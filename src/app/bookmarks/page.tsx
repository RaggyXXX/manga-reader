"use client";

import { useEffect, useState, useMemo } from "react";
import { getAllBookmarks, removeBookmark, type Bookmark } from "@/lib/bookmark-store";
import { getSeries, getChapter } from "@/lib/manga-store";
import { imageProxyUrl } from "@/lib/scraper";
import { Card, CardContent } from "@/components/ui/card";
import { Bookmark as BookmarkIcon, Filter } from "lucide-react";
import Link from "next/link";

export function BookmarksPage() {
  const [allBookmarks, setAllBookmarks] = useState(() => getAllBookmarks());
  const [filterSlug, setFilterSlug] = useState<string | null>(null);
  const [showFilter, setShowFilter] = useState(false);

  // Refresh when tour injects/removes demo data
  useEffect(() => {
    const handler = () => setAllBookmarks(getAllBookmarks());
    window.addEventListener("tour-storage-updated", handler);
    return () => window.removeEventListener("tour-storage-updated", handler);
  }, []);

  // Flatten all bookmarks into a single sorted list
  const flatBookmarks = useMemo(() => {
    const entries: Bookmark[] = [];
    for (const slug of Object.keys(allBookmarks)) {
      if (filterSlug && slug !== filterSlug) continue;
      entries.push(...allBookmarks[slug]);
    }
    return entries.sort((a, b) => b.createdAt - a.createdAt);
  }, [allBookmarks, filterSlug]);

  // Build series filter options from bookmark slugs
  const seriesOptions = useMemo(() => {
    const slugs = Object.keys(allBookmarks);
    return slugs.map((slug) => {
      const series = getSeries(slug);
      return { slug, title: series?.title || slug.replace(/-/g, " ") };
    });
  }, [allBookmarks]);

  const handleDelete = (slug: string, id: string) => {
    removeBookmark(slug, id);
    setAllBookmarks(getAllBookmarks());
  };

  const getImageUrl = (bookmark: Bookmark): string | null => {
    const chapter = getChapter(bookmark.slug, bookmark.chapterNumber);
    if (!chapter || !chapter.imageUrls[bookmark.imageIndex]) return null;
    const series = getSeries(bookmark.slug);
    const source = series?.source;
    return imageProxyUrl(chapter.imageUrls[bookmark.imageIndex], source);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BookmarkIcon className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Bookmarks</h1>
      </div>

      {/* Series filter */}
      {seriesOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowFilter(!showFilter)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-card px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-muted/60"
          >
            <Filter className="h-3.5 w-3.5" />
            {filterSlug
              ? seriesOptions.find((s) => s.slug === filterSlug)?.title || "Filter"
              : "All Series"}
          </button>
          {showFilter && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => { setFilterSlug(null); setShowFilter(false); }}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  !filterSlug
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                All
              </button>
              {seriesOptions.map((opt) => (
                <button
                  key={opt.slug}
                  onClick={() => { setFilterSlug(opt.slug); setShowFilter(false); }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    filterSlug === opt.slug
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {opt.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {flatBookmarks.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="font-medium">No bookmarks yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Long-press any page while reading to add a bookmark.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Bookmark grid */}
      {flatBookmarks.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-tour="bookmarks-grid">
          {flatBookmarks.map((bookmark) => {
            const series = getSeries(bookmark.slug);
            const seriesTitle = series?.title || bookmark.slug.replace(/-/g, " ");
            const imgUrl = getImageUrl(bookmark);

            return (
              <Card key={bookmark.id} className="overflow-hidden">
                {/* Thumbnail */}
                <div className="aspect-[3/4] overflow-hidden bg-muted">
                  {imgUrl ? (
                    <img
                      src={imgUrl}
                      alt={`Page ${bookmark.imageIndex + 1}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <BookmarkIcon className="h-8 w-8 opacity-30" />
                    </div>
                  )}
                </div>
                <CardContent className="p-3">
                  <p className="truncate text-sm font-medium">{seriesTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    Ch. {bookmark.chapterNumber}, Page {bookmark.imageIndex + 1}
                  </p>
                  {bookmark.note && (
                    <p className="mt-1 truncate text-xs text-muted-foreground italic">
                      &ldquo;{bookmark.note}&rdquo;
                    </p>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <Link
                      href={`/read/${bookmark.slug}/${bookmark.chapterNumber}`}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Read &rarr;
                    </Link>
                    <button
                      onClick={() => handleDelete(bookmark.slug, bookmark.id)}
                      className="text-xs text-destructive hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default BookmarksPage;
