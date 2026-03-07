"use client";

import { useEffect, useState, type ReactNode } from "react";
import { initBookmarkStore } from "@/lib/bookmark-store";
import { initFolderStore } from "@/lib/folder-store";
import { initMangaStore } from "@/lib/manga-store";
import { initReadingProgressStore } from "@/lib/reading-progress";
import { initUpdateFlagStore } from "@/lib/update-flag-store";

export function StorageBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      initMangaStore(),
      initBookmarkStore(),
      initReadingProgressStore(),
      initFolderStore(),
      initUpdateFlagStore(),
    ])
      .catch((error) => {
        console.error("Failed to initialize storage", error);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-6 text-foreground">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          <p className="text-sm text-muted-foreground">Preparing your library...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
