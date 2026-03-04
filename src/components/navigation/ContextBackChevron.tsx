"use client";

import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContextBackChevronProps {
  className?: string;
  onClick?: () => void;
}

export function ContextBackChevron({ className, onClick }: ContextBackChevronProps) {
  const router = useRouter();

  const handleNavigate = () => {
    onClick?.();
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  };

  return (
    <button
      type="button"
      onClick={handleNavigate}
      aria-label="Go back"
      title="Go back"
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card/90 text-foreground shadow-sm transition-colors hover:bg-muted",
        className,
      )}
    >
      <ChevronRight className="h-4 w-4" />
    </button>
  );
}

