"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { ArrowDownUp, Eye, EyeOff, Search } from "lucide-react";
import {
  clearSeriesProgress,
  getReadChapters,
  markAllChaptersRead,
} from "@/lib/reading-progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

interface ChapterItem {
  number: number;
  title: string;
  status: string;
  pageCount: number;
}

interface Props {
  chapters: ChapterItem[];
  seriesSlug: string;
}

export function ChapterList({ chapters, seriesSlug }: Props) {
  const [readChapters, setReadChapters] = useState<Set<number>>(
    () => new Set(getReadChapters(seriesSlug)),
  );
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const handleMarkAllRead = useCallback(() => {
    const allNumbers = chapters.map((ch) => ch.number);
    markAllChaptersRead(seriesSlug, allNumbers);
    setReadChapters(new Set(allNumbers));
  }, [chapters, seriesSlug]);

  const handleClearProgress = useCallback(() => {
    clearSeriesProgress(seriesSlug);
    setReadChapters(new Set());
  }, [seriesSlug]);

  const filteredChapters = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = chapters;

    if (q) {
      result = result.filter(
        (ch) => String(ch.number).includes(q) || ch.title.toLowerCase().includes(q),
      );
    }

    if (unreadOnly) {
      result = result.filter((ch) => !readChapters.has(ch.number));
    }

    return sortAsc ? result : [...result].reverse();
  }, [chapters, search, sortAsc, unreadOnly, readChapters]);

  const pendingCount = chapters.filter((ch) => ch.status === "pending").length;

  return (
    <Card data-tour="series-chapter-list">
      <CardContent className="space-y-4 p-4">
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search chapters..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              variant={unreadOnly ? "default" : "outline"}
              size="icon"
              onClick={() => setUnreadOnly((v) => !v)}
              title={unreadOnly ? "Show all" : "Unread only"}
            >
              {unreadOnly ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="icon" onClick={() => setSortAsc((prev) => !prev)} title="Sort order">
              <ArrowDownUp className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={handleMarkAllRead} type="button">
              Mark all read
            </Button>
            {confirmClear ? (
              <>
                <Button variant="destructive" size="sm" onClick={() => { handleClearProgress(); setConfirmClear(false); }} type="button">
                  Confirm clear
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirmClear(false)} type="button">
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setConfirmClear(true)} type="button">
                Mark all unread
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
          <span>{pendingCount > 0 ? `${pendingCount} chapters not yet loaded` : `${chapters.length} chapters`}</span>
        </div>

        {filteredChapters.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No chapters found
          </div>
        ) : (
          <ul className="space-y-2">
            {filteredChapters.map((ch) => {
              const isRead = readChapters.has(ch.number);
              const readTime = ch.pageCount > 0 ? Math.max(1, Math.round(ch.pageCount * 0.5)) : 0;
              return (
                <li key={ch.number}>
                  <Link
                    href={`/read/${seriesSlug}/${ch.number}`}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                      isRead
                        ? "border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                        : "border-l-4 border-l-primary border-y border-r border-border bg-background font-medium hover:bg-muted/50"
                    }`}
                  >
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        ch.status === "crawled"
                          ? isRead
                            ? "bg-emerald-500"
                            : "bg-primary"
                          : ch.status === "error"
                          ? "bg-destructive"
                          : "bg-muted-foreground"
                      }`}
                    />
                    <span className="text-xs font-semibold">#{ch.number}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{ch.title}</span>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      {readTime > 0 ? <span>~{readTime} min</span> : null}
                      {ch.pageCount > 0 ? <span>{ch.pageCount}p</span> : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
