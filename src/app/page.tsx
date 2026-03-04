"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { LibraryBig, Plus } from "lucide-react";
import { getAllSeries } from "@/lib/manga-store";
import { SeriesCard } from "@/components/SeriesCard";
import { ContinueReading } from "@/components/ContinueReading";
import { Button } from "@/components/ui/button";

export default function LibraryPage() {
  const series = getAllSeries();
  const isEmpty = series.length === 0;

  return (
    <div className="space-y-7">
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/80 p-5 shadow-sm"
      >
        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary/15 blur-2xl" />
        <div className="absolute -left-10 bottom-0 h-24 w-24 rounded-full bg-accent/30 blur-xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Manga Reader</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Cozy reading library, fully responsive and mobile optimized.
            </p>
          </div>
          <Link href="/add">
            <Button size="sm" className="shadow-sm">
              <Plus className="h-4 w-4" />
              Add series
            </Button>
          </Link>
        </div>
      </motion.section>

      {!isEmpty && (
        <ContinueReading
          series={series.map((s) => ({
            slug: s.slug,
            title: s.title,
            coverUrl: s.coverUrl || "",
            totalChapters: s.totalChapters,
            source: s.source,
          }))}
        />
      )}

      {isEmpty ? (
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: "easeOut" }}
          className="flex min-h-[52vh] flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card/70 px-6 text-center"
        >
          <div className="mb-4 rounded-2xl bg-muted p-4">
            <LibraryBig className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Your library is empty</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Add your first series to cache chapters and continue seamlessly across devices.
          </p>
          <Link href="/add" className="mt-5">
            <Button>
              <Plus className="h-4 w-4" />
              Add Series
            </Button>
          </Link>
        </motion.section>
      ) : (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground md:text-lg">Your Series</h2>
            <span className="text-xs text-muted-foreground">{series.length} Entries</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {series.map((s) => (
              <SeriesCard
                key={s.slug}
                slug={s.slug}
                title={s.title}
                coverUrl={s.coverUrl}
                totalChapters={s.totalChapters}
                source={s.source}
              />
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
