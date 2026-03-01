import { useEffect, useRef, useState, useCallback } from "react";

interface DoubleTapZoomResult {
  isZoomed: boolean;
  resetZoom: () => void;
}

export function useDoubleTapZoom(
  containerRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean
): DoubleTapZoomResult {
  const [isZoomed, setIsZoomed] = useState(false);
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);
  const panStart = useRef<{ x: number; y: number } | null>(null);
  const currentOrigin = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const resetZoom = useCallback(() => {
    const container = containerRef.current;
    if (container) {
      container.style.transform = "none";
      container.style.transformOrigin = "";
    }
    setIsZoomed(false);
    lastTap.current = null;
    panStart.current = null;
  }, [containerRef]);

  useEffect(() => {
    if (!enabled) {
      // Reset zoom state when the feature is disabled
      resetZoom();
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      const now = Date.now();
      const x = touch.clientX;
      const y = touch.clientY;

      if (
        lastTap.current &&
        now - lastTap.current.time < 300 &&
        Math.abs(x - lastTap.current.x) < 30 &&
        Math.abs(y - lastTap.current.y) < 30
      ) {
        // Double-tap detected
        e.preventDefault();

        if (!isZoomed) {
          // Zoom in: calculate transform-origin relative to container
          const rect = container.getBoundingClientRect();
          const originX = x - rect.left;
          const originY = y - rect.top;

          container.style.transformOrigin = `${originX}px ${originY}px`;
          container.style.transform = "scale(2)";
          currentOrigin.current = { x: originX, y: originY };
          setIsZoomed(true);
        } else {
          // Zoom out
          container.style.transform = "none";
          container.style.transformOrigin = "";
          setIsZoomed(false);
        }

        lastTap.current = null;
      } else {
        lastTap.current = { time: now, x, y };

        // If zoomed, prepare for panning
        if (isZoomed) {
          panStart.current = { x, y };
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isZoomed || e.touches.length !== 1 || !panStart.current) return;

      e.preventDefault();

      const touch = e.touches[0];
      const dx = touch.clientX - panStart.current.x;
      const dy = touch.clientY - panStart.current.y;

      // Shift the transform-origin to pan the view
      const newOriginX = currentOrigin.current.x - dx;
      const newOriginY = currentOrigin.current.y - dy;

      container.style.transformOrigin = `${newOriginX}px ${newOriginY}px`;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isZoomed || !panStart.current) return;

      // Commit the final origin after panning
      if (e.changedTouches.length === 1) {
        const touch = e.changedTouches[0];
        const dx = touch.clientX - panStart.current.x;
        const dy = touch.clientY - panStart.current.y;

        currentOrigin.current = {
          x: currentOrigin.current.x - dx,
          y: currentOrigin.current.y - dy,
        };
      }

      panStart.current = null;
    };

    container.addEventListener("touchstart", handleTouchStart, { passive: false });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [enabled, isZoomed, containerRef, resetZoom]);

  // Clean up transform on unmount
  useEffect(() => {
    return () => {
      const container = containerRef.current;
      if (container) {
        container.style.transform = "none";
        container.style.transformOrigin = "";
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isZoomed, resetZoom };
}
