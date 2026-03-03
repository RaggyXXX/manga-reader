import { useEffect, useRef } from "react";
import { imageProxyUrl } from "@/lib/scraper";

export function usePreloader(
  imageUrls: string[],
  currentIndex: number,
  nextChapterUrls?: string[],
  enabled: boolean = true
): void {
  const loadedUrls = useRef<Set<string>>(new Set());
  const imageObjects = useRef<HTMLImageElement[]>([]);

  useEffect(() => {
    if (!enabled) return;

    const toPreload: string[] = [];

    // Preload current image +/- 2
    for (let offset = -2; offset <= 2; offset++) {
      const idx = currentIndex + offset;
      if (idx >= 0 && idx < imageUrls.length) {
        const url = imageProxyUrl(imageUrls[idx]);
        if (!loadedUrls.current.has(url)) {
          toPreload.push(url);
          loadedUrls.current.add(url);
        }
      }
    }

    // When near the end of the chapter, preload next chapter images
    if (
      nextChapterUrls &&
      nextChapterUrls.length > 0 &&
      currentIndex >= imageUrls.length - 3
    ) {
      const count = Math.min(5, nextChapterUrls.length);
      for (let i = 0; i < count; i++) {
        const url = imageProxyUrl(nextChapterUrls[i]);
        if (!loadedUrls.current.has(url)) {
          toPreload.push(url);
          loadedUrls.current.add(url);
        }
      }
    }

    // Create Image objects to trigger browser preloading
    for (const url of toPreload) {
      const img = new Image();
      img.src = url;
      imageObjects.current.push(img);
    }
  }, [imageUrls, currentIndex, nextChapterUrls, enabled]);

  // Clean up on unmount: clear image sources and reset tracking
  useEffect(() => {
    return () => {
      for (const img of imageObjects.current) {
        img.src = "";
      }
      imageObjects.current = [];
      loadedUrls.current.clear();
    };
  }, []);
}
