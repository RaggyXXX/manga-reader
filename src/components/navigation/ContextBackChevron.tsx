"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContextBackChevronProps {
  className?: string;
  onClick?: () => void;
  variant?: "header" | "card";
}

export function ContextBackChevron({ className, onClick, variant = "header" }: ContextBackChevronProps) {
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
        "inline-flex h-9 w-9 items-center justify-center rounded-full border text-foreground shadow-sm transition-colors",
        variant === "header"
          ? "border-border/60 bg-background/70 backdrop-blur hover:bg-muted/60"
          : "border-border/70 bg-card/90 hover:bg-muted",
        className,
      )}
    >
      <ChevronLeft className="h-4 w-4" />
    </button>
  );
}

