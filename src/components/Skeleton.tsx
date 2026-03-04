"use client";

import { Skeleton as BaseSkeleton } from "@/components/ui/skeleton";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
}

export function Skeleton({ width, height, borderRadius, className }: SkeletonProps) {
  return (
    <BaseSkeleton
      className={className}
      style={{
        width,
        height,
        borderRadius,
      }}
    />
  );
}
