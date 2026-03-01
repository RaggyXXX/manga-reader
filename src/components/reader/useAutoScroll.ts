import { useEffect, useRef, useState, useCallback } from "react";

export function useAutoScroll(
  containerRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
  speed: number // pixels per second (20-200)
): { isPaused: boolean } {
  const [isPaused, setIsPaused] = useState(false);
  const rafId = useRef<number>(0);
  const lastTime = useRef<number>(0);
  const resumeTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Pause handler: user interacted manually
  const pause = useCallback(() => {
    setIsPaused(true);

    // Clear any existing resume timer
    clearTimeout(resumeTimeout.current);

    // Auto-resume after 2 seconds of inactivity
    resumeTimeout.current = setTimeout(() => {
      setIsPaused(false);
    }, 2000);
  }, []);

  // Animation loop
  useEffect(() => {
    if (!enabled || isPaused) {
      // Cancel any running frame when disabled or paused
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
        rafId.current = 0;
      }
      lastTime.current = 0;
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const tick = (now: number) => {
      if (lastTime.current === 0) {
        lastTime.current = now;
      }

      const deltaSeconds = (now - lastTime.current) / 1000;
      lastTime.current = now;

      // Clamp delta to avoid jumps after tab switch
      const clampedDelta = Math.min(deltaSeconds, 0.1);
      container.scrollTop += speed * clampedDelta;

      rafId.current = requestAnimationFrame(tick);
    };

    rafId.current = requestAnimationFrame(tick);

    return () => {
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
        rafId.current = 0;
      }
      lastTime.current = 0;
    };
  }, [enabled, isPaused, speed, containerRef]);

  // User-interaction listeners to detect manual scroll/touch
  useEffect(() => {
    if (!enabled) return;

    const container = containerRef.current;
    if (!container) return;

    const events = ["touchstart", "wheel", "mousedown"] as const;

    const handler = () => pause();

    for (const event of events) {
      container.addEventListener(event, handler, { passive: true });
    }

    return () => {
      for (const event of events) {
        container.removeEventListener(event, handler);
      }
    };
  }, [enabled, containerRef, pause]);

  // Clean up resume timeout on unmount
  useEffect(() => {
    return () => {
      clearTimeout(resumeTimeout.current);
    };
  }, []);

  return { isPaused };
}
