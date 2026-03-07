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
  getAllSeries,
  getChapters,
  saveChapter,
  updateSeriesTotalChapters,
  type StoredChapter,
} from "@/lib/manga-store";
import {
  clearUpdateFlagValue,
  getUpdateFlags,
  initUpdateFlagStore,
  setUpdateFlag,
} from "@/lib/update-flag-store";

export type SyncPhase = "idle" | "discovering" | "scraping" | "error";

const CF_PROXY_URL = process.env.NEXT_PUBLIC_CF_PROXY_URL || "";

const RECHECK_INTERVAL = 12 * 60 * 60 * 1000; // 12 hours

interface UpdateFlag {
  newCount: number;
  checkedAt: number;
}

type UpdateFlags = Record<string, UpdateFlag>;

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
  updateFlags: UpdateFlags;
  clearUpdateFlag: (slug: string) => void;
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
  const checkerRef = useRef<Worker | null>(null);
  const slugRef = useRef<string | null>(null);
  const [state, setState] = useState<SyncState>(IDLE_STATE);
  const [updateFlags, setUpdateFlags] = useState<UpdateFlags>({});

  useEffect(() => {
    void initUpdateFlagStore().then(() => {
      setUpdateFlags(getUpdateFlags());
    });
  }, []);

  // Keep slugRef in sync
  useEffect(() => {
    slugRef.current = state.slug;
  }, [state.slug]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      checkerRef.current?.terminate();
    };
  }, []);

  // Background update checker
  useEffect(() => {
    void (async () => {
      const allSeries = await getAllSeries();
      if (allSeries.length === 0) return;

      await initUpdateFlagStore();
      const flags = getUpdateFlags();
      const now = Date.now();
      const needsCheck = allSeries.filter((s) => {
        const flag = flags[s.slug];
        return !flag || now - flag.checkedAt > RECHECK_INTERVAL;
      });

      if (needsCheck.length === 0) return;

      const worker = new Worker("/update-checker-worker.js");
      checkerRef.current = worker;

      worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === "result") {
          setUpdateFlags((prev) => {
            const next: UpdateFlags = {
              ...prev,
              [msg.slug]: { newCount: msg.newCount, checkedAt: Date.now() },
            };
            setUpdateFlag(msg.slug, next[msg.slug]);
            return next;
          });
        }
        if (msg.type === "done") {
          worker.terminate();
          if (checkerRef.current === worker) checkerRef.current = null;
        }
      };

      worker.onerror = () => {
        worker.terminate();
        if (checkerRef.current === worker) checkerRef.current = null;
      };

      worker.postMessage({
        type: "check",
        series: needsCheck.map((s) => ({
          slug: s.slug,
          sourceUrl: s.sourceUrl,
          source: s.source || "manhwazone",
          sourceId: s.sourceId,
          totalChapters: s.totalChapters,
          preferredLanguage: s.preferredLanguage || "en",
        })),
        origin: window.location.origin,
      });
    })();
  }, []); // Run once on mount

  const clearUpdateFlag = useCallback((slug: string) => {
    setUpdateFlags((prev) => {
      if (!prev[slug] || prev[slug].newCount === 0) return prev;
      const next = { ...prev, [slug]: { ...prev[slug], newCount: 0 } };
      clearUpdateFlagValue(slug);
      return next;
    });
  }, []);

  const sendWorkerScrapeStart = useCallback(async (slug: string) => {
    const series = await getSeries(slug);
    const allChapters = await getChapters(slug);
    const unsynced = allChapters.filter((ch) => ch.imageUrls.length === 0);
    const alreadySynced = allChapters.length - unsynced.length;

    if (unsynced.length > 0 && workerRef.current) {
      workerRef.current.postMessage({
        type: "start",
        slug,
        seriesUrl: null,
        source: series?.source || "manhwazone",
        sourceId: series?.sourceId,
        preferredLanguage: series?.preferredLanguage || "en",
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
        case "checking_new": {
          setState((prev) => ({
            ...prev,
            phase: "discovering",
          }));
          break;
        }

        case "chapter_discovered": {
          if (!slug) break;
          const stub: StoredChapter = {
            number: msg.number,
            title: msg.title,
            url: msg.url,
            imageUrls: [],
            syncedAt: null,
          };
          void saveChapter(slug, stub);
          void updateSeriesTotalChapters(slug, msg.discoveredCount);
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
          void sendWorkerScrapeStart(slug);
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
          void saveChapter(slug, full);
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
      void (async () => {
      if (state.phase !== "idle") return;

      const series = await getSeries(slug);
      if (!series) return;

      // Clear update flag when starting sync
      clearUpdateFlag(slug);

      const allChapters = await getChapters(slug);
      const unsynced = allChapters.filter((ch) => ch.imageUrls.length === 0);
      const alreadySynced = allChapters.length - unsynced.length;

      slugRef.current = slug;
      const worker = getWorker();

      if (allChapters.length === 0) {
        // No chapters at all — full discovery from series page
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
          source: series.source || "manhwazone",
          sourceId: series.sourceId,
          preferredLanguage: series.preferredLanguage || "en",
          unsyncedChapters: [],
          alreadySyncedCount: 0,
          totalKnown: 0,
          lastChapterUrl: null,
          origin: window.location.origin,
          cfProxyUrl: CF_PROXY_URL,
        });
      } else {
        // Has chapters — check for new ones + scrape any unsynced
        const sorted = [...allChapters].sort((a, b) => b.number - a.number);
        const lastChapter = sorted[0];

        setState({
          phase: unsynced.length > 0 ? "scraping" : "discovering",
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
          source: series.source || "manhwazone",
          sourceId: series.sourceId,
          preferredLanguage: series.preferredLanguage || "en",
          unsyncedChapters: unsynced.map((ch) => ({
            number: ch.number,
            title: ch.title,
            url: ch.url,
          })),
          alreadySyncedCount: alreadySynced,
          totalKnown: allChapters.length,
          lastChapterUrl: lastChapter.url,
          origin: window.location.origin,
          cfProxyUrl: CF_PROXY_URL,
        });
      }
      })();
    },
    [state.phase, getWorker, clearUpdateFlag]
  );

  const stopSync = useCallback(() => {
    workerRef.current?.postMessage({ type: "stop" });
    setState(IDLE_STATE);
    slugRef.current = null;
  }, []);

  return (
    <SyncContext.Provider value={{ ...state, startSync, stopSync, updateFlags, clearUpdateFlag }}>
      {children}
    </SyncContext.Provider>
  );
}
