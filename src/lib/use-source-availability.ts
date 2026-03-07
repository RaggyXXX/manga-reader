import { useEffect, useState } from "react";
import type { MangaSource } from "./manga-store";
import { hydrateSourceHealthSnapshot, type SourceAvailability } from "./source-health";

export function useSourceAvailabilityMap() {
  const [availability, setAvailability] = useState<Partial<Record<MangaSource, SourceAvailability>>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadSourceHealth() {
      try {
        const response = await fetch("/api/source-health", { cache: "no-store" });
        if (!response.ok) throw new Error(`Source health failed: ${response.status}`);
        const data = await response.json() as { sources?: Partial<Record<MangaSource, SourceAvailability>> };
        if (!cancelled) {
          hydrateSourceHealthSnapshot(data.sources || {});
          setAvailability(data.sources || {});
        }
      } catch {
        if (!cancelled) {
          setAvailability({});
        }
      }
    }

    void loadSourceHealth();
    return () => {
      cancelled = true;
    };
  }, []);

  return availability;
}
