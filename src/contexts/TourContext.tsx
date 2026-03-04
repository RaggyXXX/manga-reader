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
import { usePathname, useRouter } from "next/navigation";
import { driver, type DriveStep, type Driver } from "driver.js";
import "driver.js/dist/driver.css";

const TOUR_DONE_KEY = "tour-completed";

interface TourContextValue {
  startTour: () => void;
  isTourActive: boolean;
}

const TourContext = createContext<TourContextValue>({
  startTour: () => {},
  isTourActive: false,
});

export function useTour() {
  return useContext(TourContext);
}

interface TourPhase {
  path: string;
  steps: DriveStep[];
}

function buildTourPhases(hasLibrary: boolean): TourPhase[] {
  const phases: TourPhase[] = [];

  // Phase 1: Library page
  if (hasLibrary) {
    phases.push({
      path: "/",
      steps: [
        {
          element: '[data-tour="library-toolbar"]',
          popover: {
            title: "Filter & Sort",
            description:
              "Filter your library by source, status, or favorites. Sort by last read, name, and more.",
            side: "bottom",
            align: "start",
          },
        },
      ],
    });
  } else {
    phases.push({
      path: "/",
      steps: [
        {
          element: '[data-tour="library-add-empty"]',
          popover: {
            title: "Start Here",
            description:
              "Your library is empty. Tap here to add your first manga series!",
            side: "top",
            align: "center",
          },
        },
      ],
    });
  }

  // Phase 2: Add page
  phases.push({
    path: "/add",
    steps: [
      {
        element: '[data-tour="add-search-tab"]',
        popover: {
          title: "Search",
          description:
            "Search for manga across all supported sources — MangaDex, MangaKatana, VyManga, and Manhwazone.",
          side: "bottom",
          align: "start",
        },
      },
      {
        element: '[data-tour="add-url-tab"]',
        popover: {
          title: "Add by URL",
          description:
            "Or paste a direct link to a manga series page from any supported source.",
          side: "bottom",
          align: "start",
        },
      },
    ],
  });

  return phases;
}

export function TourProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const driverRef = useRef<Driver | null>(null);
  const phasesRef = useRef<TourPhase[]>([]);
  const phaseIndexRef = useRef(0);
  const awaitingNavRef = useRef(false);
  const activeRef = useRef(false);

  // Keep activeRef in sync
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const cleanup = useCallback(() => {
    driverRef.current?.destroy();
    driverRef.current = null;
    setActive(false);
    activeRef.current = false;
    phaseIndexRef.current = 0;
    awaitingNavRef.current = false;
  }, []);

  const advanceToNextPhase = useCallback(
    (currentPhaseIdx: number) => {
      const phases = phasesRef.current;
      const nextIdx = currentPhaseIdx + 1;

      if (nextIdx >= phases.length) {
        // Tour complete
        localStorage.setItem(TOUR_DONE_KEY, "true");
        cleanup();
        return;
      }

      awaitingNavRef.current = true;
      phaseIndexRef.current = nextIdx;
      router.push(phases[nextIdx].path);
    },
    [cleanup, router],
  );

  const runPhase = useCallback(
    (phaseIdx: number) => {
      const phases = phasesRef.current;
      if (phaseIdx >= phases.length) {
        localStorage.setItem(TOUR_DONE_KEY, "true");
        cleanup();
        return;
      }

      const phase = phases[phaseIdx];
      phaseIndexRef.current = phaseIdx;

      // Destroy previous driver instance
      if (driverRef.current) {
        driverRef.current.destroy();
        driverRef.current = null;
      }

      const isLastPhase = phaseIdx >= phases.length - 1;

      driverRef.current = driver({
        showProgress: true,
        steps: phase.steps,
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: isLastPhase ? "Done!" : "Next Page →",
        progressText: "",
        allowClose: true,
        overlayColor: "rgba(0, 0, 0, 0.6)",
        stagePadding: 8,
        stageRadius: 12,
        popoverClass: "manga-tour-popover",
        onDestroyStarted: () => {
          const d = driverRef.current;
          if (!d) return;

          if (!d.hasNextStep()) {
            // Completed all steps in this phase
            d.destroy();
            advanceToNextPhase(phaseIdx);
          } else {
            // User closed early
            localStorage.setItem(TOUR_DONE_KEY, "true");
            d.destroy();
            cleanup();
          }
        },
      });

      // Delay to let DOM render target elements
      setTimeout(() => {
        driverRef.current?.drive();
      }, 400);
    },
    [cleanup, advanceToNextPhase],
  );

  // Resume tour after page navigation
  useEffect(() => {
    if (!awaitingNavRef.current || !activeRef.current) return;
    const phases = phasesRef.current;
    const idx = phaseIndexRef.current;

    if (idx < phases.length && pathname === phases[idx].path) {
      awaitingNavRef.current = false;
      setTimeout(() => runPhase(idx), 500);
    }
  }, [pathname, runPhase]);

  // Auto-start on first visit
  useEffect(() => {
    if (typeof window === "undefined") return;
    const done = localStorage.getItem(TOUR_DONE_KEY);
    if (!done && pathname === "/") {
      const timer = setTimeout(() => {
        startTourInternal();
      }, 1200);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startTourInternal = useCallback(() => {
    // Check if library has series
    const raw = localStorage.getItem("manga-series");
    const hasLibrary =
      !!raw && Object.keys(JSON.parse(raw || "{}")).length > 0;

    const phases = buildTourPhases(hasLibrary);

    // If library has series, add a series detail phase
    if (hasLibrary) {
      const seriesMap = JSON.parse(raw || "{}");
      const firstSlug = Object.keys(seriesMap)[0];
      if (firstSlug) {
        phases.push({
          path: `/series/${firstSlug}`,
          steps: [
            {
              element: '[data-tour="series-sync"]',
              popover: {
                title: "Sync Chapters",
                description:
                  "Download chapter data for offline reading. Syncs run in the background.",
                side: "bottom",
                align: "start",
              },
            },
            {
              element: '[data-tour="series-share-fav"]',
              popover: {
                title: "Share & Favorite",
                description:
                  "Share this series with friends or mark it as a favorite for quick access.",
                side: "bottom",
                align: "end",
              },
            },
          ],
        });
      }
    }

    phasesRef.current = phases;
    phaseIndexRef.current = 0;
    setActive(true);

    // Navigate to first phase page if needed
    if (pathname !== phases[0].path) {
      awaitingNavRef.current = true;
      router.push(phases[0].path);
    } else {
      runPhase(0);
    }
  }, [pathname, router, runPhase]);

  const startTour = useCallback(() => {
    localStorage.removeItem(TOUR_DONE_KEY);
    startTourInternal();
  }, [startTourInternal]);

  return (
    <TourContext.Provider value={{ startTour, isTourActive: active }}>
      {children}
    </TourContext.Provider>
  );
}
