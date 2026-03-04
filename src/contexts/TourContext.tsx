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
const DEMO_SLUG = "demo-tutorial-manga";
const SERIES_KEY = "manga-series";
const CHAPTERS_KEY = "manga-chapters";

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

// --- Demo manga injection / cleanup ---

function injectDemoManga() {
  const seriesMap = JSON.parse(localStorage.getItem(SERIES_KEY) || "{}");
  if (seriesMap[DEMO_SLUG]) return; // already exists

  seriesMap[DEMO_SLUG] = {
    slug: DEMO_SLUG,
    title: "Tutorial: Example Manga",
    coverUrl: "/mangablast.png",
    sourceUrl: "https://example.com/demo-tutorial",
    totalChapters: 3,
    addedAt: Date.now(),
    source: "manhwazone",
  };
  localStorage.setItem(SERIES_KEY, JSON.stringify(seriesMap));

  // Add a few demo chapters so the chapter list renders
  const chaptersMap = JSON.parse(localStorage.getItem(CHAPTERS_KEY) || "{}");
  chaptersMap[DEMO_SLUG] = {
    1: { number: 1, title: "Chapter 1: Getting Started", url: "", imageUrls: [], syncedAt: null },
    2: { number: 2, title: "Chapter 2: Adding Series", url: "", imageUrls: [], syncedAt: null },
    3: { number: 3, title: "Chapter 3: Reading", url: "", imageUrls: [], syncedAt: null },
  };
  localStorage.setItem(CHAPTERS_KEY, JSON.stringify(chaptersMap));
}

function removeDemoManga() {
  const seriesMap = JSON.parse(localStorage.getItem(SERIES_KEY) || "{}");
  delete seriesMap[DEMO_SLUG];
  localStorage.setItem(SERIES_KEY, JSON.stringify(seriesMap));

  const chaptersMap = JSON.parse(localStorage.getItem(CHAPTERS_KEY) || "{}");
  delete chaptersMap[DEMO_SLUG];
  localStorage.setItem(CHAPTERS_KEY, JSON.stringify(chaptersMap));
}

// --- Tour phase definitions ---

interface TourPhase {
  path: string;
  steps: DriveStep[];
}

function buildTourPhases(): TourPhase[] {
  // Check if user has real series (not counting demo)
  const seriesMap = JSON.parse(localStorage.getItem(SERIES_KEY) || "{}");
  const realSlugs = Object.keys(seriesMap).filter((s) => s !== DEMO_SLUG);
  const hasRealLibrary = realSlugs.length > 0;

  const phases: TourPhase[] = [];

  // Phase 1: Library page
  phases.push({
    path: "/",
    steps: hasRealLibrary
      ? [
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
        ]
      : [
          {
            popover: {
              title: "Welcome to Manga Blast!",
              description:
                "Let's take a quick tour. We've added an example manga so you can see all features in action.",
            },
          },
        ],
  });

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

  // Phase 3: Series detail (always uses demo manga)
  phases.push({
    path: `/series/${DEMO_SLUG}`,
    steps: [
      {
        element: '[data-tour="series-sync"]',
        popover: {
          title: "Download & Update",
          description:
            'Tap "Download all" to save chapters for offline reading. When new chapters are available, the button changes to "Update". Syncs run in the background.',
          side: "top",
          align: "center",
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

  // Phase 4: Install guide
  phases.push({
    path: "/install",
    steps: [
      {
        element: '[data-tour="install-page"]',
        popover: {
          title: "Install Manga Blast",
          description:
            "Add Manga Blast to your home screen for fullscreen reading, offline access, and a native app experience.",
          side: "bottom",
          align: "center",
        },
      },
    ],
  });

  return phases;
}

// --- Provider ---

export function TourProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const driverRef = useRef<Driver | null>(null);
  const phasesRef = useRef<TourPhase[]>([]);
  const phaseIndexRef = useRef(0);
  const awaitingNavRef = useRef(false);
  const activeRef = useRef(false);
  const demoInjectedRef = useRef(false);

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

    // Remove demo manga and navigate to library
    if (demoInjectedRef.current) {
      removeDemoManga();
      demoInjectedRef.current = false;
      router.push("/");
    }
  }, [router]);

  const advanceToNextPhase = useCallback(
    (currentPhaseIdx: number) => {
      const phases = phasesRef.current;
      const nextIdx = currentPhaseIdx + 1;

      if (nextIdx >= phases.length) {
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
    // Inject demo manga so all steps are available
    injectDemoManga();
    demoInjectedRef.current = true;

    const phases = buildTourPhases();
    phasesRef.current = phases;
    phaseIndexRef.current = 0;
    setActive(true);

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
