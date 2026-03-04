"use client";

import { useSyncContext } from "@/contexts/SyncContext";
import { Button } from "@/components/ui/button";

export function SyncProgressBar() {
  const { phase, discovered, completed, total, error, stopSync } = useSyncContext();

  if (phase === "idle") return null;

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

  return (
    <div className="sticky top-16 z-40 mx-auto mb-2 w-full max-w-5xl px-4">
      <div className="relative overflow-hidden rounded-xl border border-border bg-card px-3 py-2">
        <div
          className={`absolute inset-y-0 left-0 rounded-r-xl bg-primary/20 ${isDiscovering ? "animate-pulse" : ""}`}
          style={isDiscovering ? undefined : { width: `${pct}%` }}
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
