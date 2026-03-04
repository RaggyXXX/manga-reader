"use client";

import { useRef, useState, useEffect } from "react";
import { Heart, Tag, Trash2, X } from "lucide-react";
import type { ReadingStatus } from "@/lib/manga-store";

const STATUS_OPTIONS: { value: ReadingStatus | "none"; label: string; color: string }[] = [
  { value: "reading", label: "Reading", color: "#3b82f6" },
  { value: "plan_to_read", label: "Plan to Read", color: "#a855f7" },
  { value: "completed", label: "Completed", color: "#22c55e" },
  { value: "on_hold", label: "On Hold", color: "#f59e0b" },
  { value: "dropped", label: "Dropped", color: "#ef4444" },
  { value: "none", label: "None", color: "#6b7280" },
];

interface BatchActionBarProps {
  count: number;
  onCancel: () => void;
  onDelete: () => void;
  onFavorite: () => void;
  onStatusChange: (status: ReadingStatus | undefined) => void;
}

export function BatchActionBar({ count, onCancel, onDelete, onFavorite, onStatusChange }: BatchActionBarProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setShowStatus(false);
      }
    }
    if (showStatus) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [showStatus]);

  return (
    <div className="fixed inset-x-0 bottom-16 z-50 flex items-center justify-between gap-2 border-t border-border bg-card px-4 py-3 shadow-lg md:bottom-0">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onCancel} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
          <X className="h-5 w-5" />
        </button>
        <span className="text-sm font-medium">{count} selected</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onFavorite}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/50"
          title="Favorite"
        >
          <Heart className="h-4 w-4" />
        </button>

        <div className="relative" ref={statusRef}>
          <button
            type="button"
            onClick={() => setShowStatus((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/50"
            title="Set status"
          >
            <Tag className="h-4 w-4" />
          </button>
          {showStatus && (
            <div className="absolute bottom-full right-0 mb-2 min-w-[160px] overflow-hidden rounded-lg border border-border bg-card shadow-lg">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onStatusChange(opt.value === "none" ? undefined : opt.value);
                    setShowStatus(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors text-foreground hover:bg-muted/50"
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: opt.color }} />
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { onDelete(); setConfirmDelete(false); }}
              className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 rounded-lg border border-destructive/50 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
            title="Delete selected"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
