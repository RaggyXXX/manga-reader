"use client";

import styles from "./Skeleton.module.css";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
}

export function Skeleton({
  width,
  height,
  borderRadius,
  className,
}: SkeletonProps) {
  return (
    <div
      className={`${styles.skeleton}${className ? ` ${className}` : ""}`}
      style={{
        width,
        height,
        borderRadius,
      }}
    />
  );
}
