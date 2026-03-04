"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getSeries,
  getChapters,
  saveChapter,
  updateSeriesTotalChapters,
  type StoredChapter,
} from "@/lib/manga-store";

export type SyncPhase = "idle" | "discovering" | "scraping" | "error";

const CF_PROXY_URL = process.env.NEXT_PUBLIC_CF_PROXY_URL || "";

interface SyncState {
  phase: SyncPhase;
  slug: string | null;
  discovered: number;
  completed: number;
  total: number;
  error: string | null;
}

interface SyncContextValue extends SyncState {
  startSync: (slug: string) => void;
  stopSync: () => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

const IDLE_STATE: SyncState = {
  phase: "idle",
  slug: null,
  discovered: 0,
  completed: 0,
  total: 0,
  error: null,
};

export function useSyncContext(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSyncContext must be used within SyncProvider");
  return ctx;
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const workerRef = useRef<Worker | null>(null);
  const slugRef = useRef<string | null>(null);
  const [state, setState] = useState<SyncState>(IDLE_STATE);

  // Keep slugRef in sync
  useEffect(() => {
    slugRef.current = state.slug;
  }, [state.slug]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const sendWorkerScrapeStart = useCallback((slug: string) => {
    const allChapters = getChapters(slug);
    const unsynced = allChapters.filter((ch) => ch.imageUrls.length === 0);
    const alreadySynced = allChapters.length - unsynced.length;

    if (unsynced.length > 0 && workerRef.current) {
      workerRef.current.postMessage({
        type: "start",
        slug,
        seriesUrl: null,
        unsyncedChapters: unsynced.map((ch) => ({
          number: ch.number,
          title: ch.title,
          url: ch.url,
        })),
        alreadySyncedCount: alreadySynced,
        totalKnown: allChapters.length,
        origin: window.location.origin,
        cfProxyUrl: CF_PROXY_URL,
      });
      setState({
        phase: "scraping",
        slug,
        discovered: allChapters.length,
        completed: alreadySynced,
        total: allChapters.length,
        error: null,
      });
    } else {
      // All chapters already synced
      setState(IDLE_STATE);
    }
  }, []);

  const handleWorkerMessage = useCallback(
    (e: MessageEvent) => {
      const msg = e.data;
      const slug = slugRef.current;

      switch (msg.type) {
        case "chapter_discovered": {
          if (!slug) break;
          const stub: StoredChapter = {
            number: msg.number,
            title: msg.title,
            url: msg.url,
            imageUrls: [],
            syncedAt: null,
          };
          saveChapter(slug, stub);
          updateSeriesTotalChapters(slug, msg.discoveredCount);
          setState((prev) => ({
            ...prev,
            phase: "discovering",
            discovered: msg.discoveredCount,
          }));
          break;
        }

        case "discovery_done": {
          if (!slug) break;
          // Transition to scraping phase
          sendWorkerScrapeStart(slug);
          break;
        }

        case "chapter_scraped": {
          if (!slug) break;
          const full: StoredChapter = {
            number: msg.number,
            title: msg.title,
            url: msg.url,
            imageUrls: msg.imageUrls,
            syncedAt: Date.now(),
          };
          saveChapter(slug, full);
          setState((prev) => ({
            ...prev,
            completed: msg.completed,
            total: msg.total,
          }));
          break;
        }

        case "done": {
          setState(IDLE_STATE);
          slugRef.current = null;
          break;
        }

        case "stopped": {
          setState(IDLE_STATE);
          slugRef.current = null;
          break;
        }

        case "error": {
          console.error("Sync worker error:", msg.error);
          setState({
            ...IDLE_STATE,
            phase: "error",
            error: msg.error || "Sync fehlgeschlagen",
          });
          slugRef.current = null;
          // Auto-clear error after 5s
          setTimeout(() => {
            setState((prev) => (prev.phase === "error" ? IDLE_STATE : prev));
          }, 5000);
          break;
        }
      }
    },
    [sendWorkerScrapeStart]
  );

  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker("/sync-worker.js");
      workerRef.current.onerror = (e) => {
        console.error("Sync worker error:", e);
        setState(IDLE_STATE);
        slugRef.current = null;
      };
    }
    // Always re-attach to get latest closure
    workerRef.current.onmessage = handleWorkerMessage;
    return workerRef.current;
  }, [handleWorkerMessage]);

  const startSync = useCallback(
    (slug: string) => {
      if (state.phase !== "idle") return;

      const series = getSeries(slug);
      if (!series) return;

      const allChapters = getChapters(slug);
      const unsynced = allChapters.filter((ch) => ch.imageUrls.length === 0);
      const alreadySynced = allChapters.length - unsynced.length;

      slugRef.current = slug;
      const worker = getWorker();

      if (allChapters.length === 0) {
        setState({
          phase: "discovering",
          slug,
          discovered: 0,
          completed: 0,
          total: 0,
          error: null,
        });
        worker.postMessage({
          type: "start",
          slug,
          seriesUrl: series.sourceUrl,
          unsyncedChapters: [],
          alreadySyncedCount: 0,
          totalKnown: 0,
          origin: window.location.origin,
        });
      } else if (unsynced.length > 0) {
        setState({
          phase: "scraping",
          slug,
          discovered: allChapters.length,
          completed: alreadySynced,
          total: allChapters.length,
          error: null,
        });
        worker.postMessage({
          type: "start",
          slug,
          seriesUrl: null,
          unsyncedChapters: unsynced.map((ch) => ({
            number: ch.number,
            title: ch.title,
            url: ch.url,
          })),
          alreadySyncedCount: alreadySynced,
          totalKnown: allChapters.length,
          origin: window.location.origin,
        });
      } else {
        // All chapters already synced — brief feedback
        setState({
          phase: "scraping",
          slug,
          discovered: allChapters.length,
          completed: allChapters.length,
          total: allChapters.length,
          error: null,
        });
        setTimeout(() => {
          setState((prev) => (prev.slug === slug && prev.completed === prev.total ? IDLE_STATE : prev));
        }, 1500);
      }
    },
    [state.phase, getWorker]
  );

  const stopSync = useCallback(() => {
    workerRef.current?.postMessage({ type: "stop" });
    setState(IDLE_STATE);
    slugRef.current = null;
  }, []);

  return (
    <SyncContext.Provider value={{ ...state, startSync, stopSync }}>
      {children}
    </SyncContext.Provider>
  );
}
