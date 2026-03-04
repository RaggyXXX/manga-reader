"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ReadingStatus } from "@/lib/manga-store";

const STATUS_OPTIONS: { value: ReadingStatus | "none"; label: string; color: string }[] = [
  { value: "reading", label: "Reading", color: "#3b82f6" },
  { value: "plan_to_read", label: "Plan to Read", color: "#a855f7" },
  { value: "completed", label: "Completed", color: "#22c55e" },
  { value: "on_hold", label: "On Hold", color: "#f59e0b" },
  { value: "dropped", label: "Dropped", color: "#ef4444" },
  { value: "none", label: "None", color: "#6b7280" },
];

interface StatusSelectorProps {
  value?: ReadingStatus;
  onChange: (status: ReadingStatus | undefined) => void;
}

export function StatusSelector({ value, onChange }: StatusSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  const current = STATUS_OPTIONS.find((o) => o.value === (value ?? "none")) ?? STATUS_OPTIONS[5];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
      >
        <span className="h-2 w-2 rounded-full" style={{ background: current.color }} />
        {current.label}
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 min-w-[160px] overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value === "none" ? undefined : opt.value);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                (value ?? "none") === opt.value
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-foreground hover:bg-muted/50"
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: opt.color }} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: ReadingStatus }) {
  const opt = STATUS_OPTIONS.find((o) => o.value === status);
  if (!opt) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
      style={{ background: opt.color }}
    >
      {opt.label}
    </span>
  );
}
