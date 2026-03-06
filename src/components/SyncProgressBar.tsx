"use client";

import { usePathname } from "next/navigation";
import { useSyncContext } from "@/contexts/SyncContext";
import { Button } from "@/components/ui/button";

export function SyncProgressBar() {
  const pathname = usePathname();
  const { phase, slug: syncSlug, discovered, completed, total, error, stopSync } = useSyncContext();
  const isReaderRoute = pathname.startsWith("/read/");
  const isCurrentSyncSeriesPage = Boolean(syncSlug) && pathname === `/series/${syncSlug}`;

  if (phase === "idle") return null;

  // Thin bottom line for reader mode
  if (isReaderRoute && phase !== "error") {
    const isDiscovering = phase === "discovering";
    const pct = isDiscovering ? 100 : total > 0 ? (completed / total) * 100 : 0;

    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 h-1">
        <div
          className={`h-full bg-primary/60 transition-all duration-500 ${isDiscovering ? "animate-pulse" : ""}`}
          style={isDiscovering ? { width: "100%" } : { width: `${pct}%` }}
        />
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="sticky top-16 z-40 mx-auto mb-2 w-full max-w-5xl px-4">
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          {error || "Sync failed"}
        </div>
      </div>
    );
  }

  const isDiscovering = phase === "discovering";
  const pct = isDiscovering ? 100 : total > 0 ? (completed / total) * 100 : 0;

  // Global, lightweight bar for all non-reader pages except the currently synced series page.
  // The series page already has its own dedicated sync control with progress feedback.
  if (!isCurrentSyncSeriesPage) {
    return (
      <div
        data-testid="global-sync-slim"
        className="fixed left-0 right-0 z-40 h-[3px] overflow-hidden bg-muted/35"
        style={{ bottom: "calc(49px + var(--sab, 0px))" }}
      >
        <div
          className={`h-full bg-primary/70 transition-all duration-500 ${isDiscovering ? "animate-pulse" : ""}`}
          style={isDiscovering ? { width: "35%" } : { width: `${pct}%` }}
        />
      </div>
    );
  }

  return (
    <div className="sticky top-16 z-40 mx-auto mb-2 w-full max-w-5xl px-4">
      <div className="relative overflow-hidden rounded-xl border border-border bg-card px-3 py-2">
        <div className="absolute inset-0 bg-muted/30" />
        <div
          className={`absolute inset-y-0 left-0 rounded-r-xl bg-primary/15 ${isDiscovering ? "animate-pulse" : ""}`}
          style={isDiscovering ? { width: "35%" } : { width: `${pct}%` }}
        />
        <div className="relative flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-foreground">
            {isDiscovering ? `Discovering chapters... ${discovered}` : `${completed} / ${total}`}
          </span>
          <Button size="sm" variant="outline" onClick={stopSync} className="h-7 text-xs">
            Stop
          </Button>
        </div>
      </div>
    </div>
  );
}
