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
const PROGRESS_KEY = "manga-reader-progress";
const BOOKMARKS_KEY = "manga-bookmarks";

type TourMode = "short" | "long";

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

function injectDemoManga() {
  const now = Date.now();

  const seriesMap = JSON.parse(localStorage.getItem(SERIES_KEY) || "{}");
  if (!seriesMap[DEMO_SLUG]) {
    seriesMap[DEMO_SLUG] = {
      slug: DEMO_SLUG,
      title: "Tutorial: Example Manga",
      coverUrl: "/mangablast.png",
      sourceUrl: "https://example.com/demo-tutorial",
      totalChapters: 3,
      addedAt: now,
      source: "manhwazone",
    };
    localStorage.setItem(SERIES_KEY, JSON.stringify(seriesMap));
  }

  const chaptersMap = JSON.parse(localStorage.getItem(CHAPTERS_KEY) || "{}");
  if (!chaptersMap[DEMO_SLUG]) {
    chaptersMap[DEMO_SLUG] = {
      1: { number: 1, title: "Chapter 1: Getting Started", url: "", imageUrls: [], syncedAt: null },
      2: { number: 2, title: "Chapter 2: Adding Series", url: "", imageUrls: [], syncedAt: null },
      3: { number: 3, title: "Chapter 3: Reading", url: "", imageUrls: [], syncedAt: null },
    };
    localStorage.setItem(CHAPTERS_KEY, JSON.stringify(chaptersMap));
  }

  const progressMap = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
  progressMap[DEMO_SLUG] = {
    lastReadChapter: 2,
    readChapters: [1, 2],
    chapterProgress: {
      1: { scrollPercent: 100, imageIndex: 12, timestamp: now - 3600000 },
      2: { scrollPercent: 45, imageIndex: 5, timestamp: now - 600000 },
    },
  };
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progressMap));

  const bookmarksMap = JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || "{}");
  bookmarksMap[DEMO_SLUG] = [
    {
      id: "demo-bookmark-1",
      slug: DEMO_SLUG,
      chapterNumber: 1,
      imageIndex: 3,
      note: "Cool panel!",
      createdAt: now - 1800000,
    },
    {
      id: "demo-bookmark-2",
      slug: DEMO_SLUG,
      chapterNumber: 2,
      imageIndex: 0,
      createdAt: now - 300000,
    },
  ];
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarksMap));

  window.dispatchEvent(new Event("tour-storage-updated"));
}

function removeDemoManga() {
  const seriesMap = JSON.parse(localStorage.getItem(SERIES_KEY) || "{}");
  delete seriesMap[DEMO_SLUG];
  localStorage.setItem(SERIES_KEY, JSON.stringify(seriesMap));

  const chaptersMap = JSON.parse(localStorage.getItem(CHAPTERS_KEY) || "{}");
  delete chaptersMap[DEMO_SLUG];
  localStorage.setItem(CHAPTERS_KEY, JSON.stringify(chaptersMap));

  const progressMap = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
  delete progressMap[DEMO_SLUG];
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progressMap));

  const bookmarksMap = JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || "{}");
  delete bookmarksMap[DEMO_SLUG];
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarksMap));

  window.dispatchEvent(new Event("tour-storage-updated"));
}

interface TourPhase {
  path: string;
  steps: DriveStep[];
}

function buildTourPhases(mode: TourMode): TourPhase[] {
  const seriesMap = JSON.parse(localStorage.getItem(SERIES_KEY) || "{}");
  const realSlugs = Object.keys(seriesMap).filter((s) => s !== DEMO_SLUG);
  const hasRealLibrary = realSlugs.length > 0;

  if (mode === "short") {
    return buildShortTourPhases(hasRealLibrary);
  }
  return buildLongTourPhases(hasRealLibrary);
}

function buildShortTourPhases(hasRealLibrary: boolean): TourPhase[] {
  return [
    {
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
                title: "Quick Tour",
                description:
                  "This short tour highlights the most important parts of the current Manga Blast app.",
              },
            },
          ],
    },
    {
      path: "/add",
      steps: [
        {
          element: '[data-tour="add-featured"]',
          popover: {
            title: "Featured Picks",
            description:
              "Before you search, Manga Blast shows a live featured shelf with popular manga you can preview and add instantly.",
            side: "bottom",
            align: "center",
          },
        },
      ],
    },
    {
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
            description: "Share this series with friends or mark it as a favorite for quick access.",
            side: "bottom",
            align: "end",
          },
        },
      ],
    },
    {
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
    },
  ];
}

function buildLongTourPhases(hasRealLibrary: boolean): TourPhase[] {
  const librarySteps: DriveStep[] = [
    {
      popover: {
        title: "Full Tour",
        description: hasRealLibrary
          ? "This longer tour walks through the current app from library browsing to install flow."
          : "This longer tour walks through the current app and all major features using demo data where needed.",
      },
    },
    ...(hasRealLibrary
      ? [
          {
            element: '[data-tour="library-quick-continue"]',
            popover: {
              title: "Quick Continue",
              description: "Jump back in and continue reading from your latest progress with one tap.",
              side: "bottom" as const,
              align: "start" as const,
            },
          },
        ]
      : []),
    {
      element: '[data-tour="library-sort"]',
      popover: {
        title: "Sort",
        description: "Sort your library by last read, name, recently added, or chapter count.",
        side: "bottom",
        align: "start",
      },
    },
    {
      element: '[data-tour="library-filter-favorites"]',
      popover: {
        title: "Favorites Filter",
        description: "Filter the library down to your favorited series only.",
        side: "bottom",
        align: "start",
      },
    },
    {
      element: '[data-tour="library-view-toggle"]',
      popover: {
        title: "Grid / List View",
        description: "Switch between compact list view and visual cover grid view.",
        side: "bottom",
        align: "end",
      },
    },
  ];

  return [
    { path: "/", steps: librarySteps },
    {
      path: "/add",
      steps: [
        {
          element: '[data-tour="add-featured"]',
          popover: {
            title: "Featured Picks",
            description: "The add page opens with live featured manga so popular titles are immediately discoverable.",
            side: "bottom",
            align: "center",
          },
        },
        {
          element: '[data-tour="add-search-input"]',
          popover: {
            title: "Search Anything",
            description: "Search across supported manga sources and open previews before adding a title.",
            side: "bottom",
            align: "start",
          },
        },
        {
          element: '[data-tour="add-source-filter"]',
          popover: {
            title: "Source Filter",
            description: "Limit browsing or search results to a preferred source when you want a tighter list.",
            side: "bottom",
            align: "start",
          },
        },
      ],
    },
    {
      path: `/series/${DEMO_SLUG}`,
      steps: [
        {
          element: '[data-tour="series-reading-status"]',
          popover: {
            title: "Reading Status",
            description: "Track whether a series is reading, planned, completed, on hold, or dropped.",
            side: "bottom",
            align: "start",
          },
        },
        {
          element: '[data-tour="series-sync"]',
          popover: {
            title: "Download & Update",
            description:
              'Tap "Download all" to save chapters offline. Later this same control becomes "Update" when new chapters are available.',
            side: "top",
            align: "center",
          },
        },
        {
          element: '[data-tour="series-share-fav"]',
          popover: {
            title: "Share & Favorite",
            description: "Share a series quickly or mark it as a favorite for faster access from the library.",
            side: "bottom",
            align: "end",
          },
        },
        {
          element: '[data-tour="series-chapter-list"]',
          popover: {
            title: "Chapter List",
            description: "Browse, search, filter, and sort chapters from the series page.",
            side: "top",
            align: "center",
          },
        },
      ],
    },
    {
      path: "/bookmarks",
      steps: [
        {
          element: '[data-tour="bookmarks-grid"]',
          popover: {
            title: "Bookmarks",
            description: "Saved pages and panels appear here so you can jump back into memorable moments.",
            side: "bottom",
            align: "center",
          },
        },
      ],
    },
    {
      path: "/stats",
      steps: [
        {
          element: '[data-tour="stats-metrics"]',
          popover: {
            title: "Reading Metrics",
            description: "Track chapters read, pages viewed, and estimated reading time.",
            side: "bottom",
            align: "center",
          },
        },
        {
          element: '[data-tour="stats-offline-storage"]',
          popover: {
            title: "Offline Storage",
            description: "Review cached chapters per series and clear storage when needed.",
            side: "top",
            align: "center",
          },
        },
      ],
    },
    {
      path: "/install",
      steps: [
        {
          element: '[data-tour="install-page"]',
          popover: {
            title: "Install Manga Blast",
            description: "Add Manga Blast to your home screen for the full app-like experience and offline reading.",
            side: "bottom",
            align: "center",
          },
        },
      ],
    },
  ];
}

function TourChoiceDialog({ onChoice }: { onChoice: (mode: TourMode) => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
      style={{ touchAction: "none" }}
    >
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <h2 className="text-center text-xl font-bold text-foreground">
          Welcome to Manga Blast!
        </h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Choose how you&apos;d like to explore the app.
        </p>

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={() => onChoice("short")}
            className="w-full rounded-xl border border-border bg-background px-4 py-3.5 text-left transition-colors hover:bg-muted/50"
          >
            <p className="font-semibold text-foreground">Short Tour</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Quick overview of the essentials - ~2 min
            </p>
          </button>

          <button
            type="button"
            onClick={() => onChoice("long")}
            className="w-full rounded-xl border-2 border-primary bg-primary/5 px-4 py-3.5 text-left transition-colors hover:bg-primary/10"
          >
            <p className="font-semibold text-foreground">Long Tour</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Full walkthrough of all features - ~5 min
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}

export function TourProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [showChoice, setShowChoice] = useState(false);
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
        doneBtnText: isLastPhase ? "Done!" : "Next Page ->",
        progressText: "",
        allowClose: false,
        disableButtons: ["close"],
        overlayColor: "rgba(0, 0, 0, 0.6)",
        stagePadding: 8,
        stageRadius: 12,
        popoverClass: "manga-tour-popover",
        onDestroyStarted: () => {
          const currentDriver = driverRef.current;
          if (!currentDriver) return;

          if (!currentDriver.hasNextStep()) {
            currentDriver.destroy();
            advanceToNextPhase(phaseIdx);
          }
        },
      });

      setTimeout(() => {
        driverRef.current?.drive();
      }, 400);
    },
    [cleanup, advanceToNextPhase],
  );

  useEffect(() => {
    if (!awaitingNavRef.current || !activeRef.current) return;
    const phases = phasesRef.current;
    const idx = phaseIndexRef.current;

    if (idx < phases.length && pathname === phases[idx].path) {
      awaitingNavRef.current = false;
      setTimeout(() => runPhase(idx), 500);
    }
  }, [pathname, runPhase]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const done = localStorage.getItem(TOUR_DONE_KEY);
    if (!done && pathname === "/") {
      const timer = setTimeout(() => {
        setShowChoice(true);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [pathname]);

  const startTourWithMode = useCallback(
    (mode: TourMode) => {
      setShowChoice(false);
      injectDemoManga();
      demoInjectedRef.current = true;

      const phases = buildTourPhases(mode);
      phasesRef.current = phases;
      phaseIndexRef.current = 0;
      setActive(true);

      if (pathname !== phases[0].path) {
        awaitingNavRef.current = true;
        router.push(phases[0].path);
      } else {
        runPhase(0);
      }
    },
    [pathname, router, runPhase],
  );

  const handleChoice = useCallback(
    (mode: TourMode) => {
      startTourWithMode(mode);
    },
    [startTourWithMode],
  );

  const startTour = useCallback(() => {
    localStorage.removeItem(TOUR_DONE_KEY);
    setShowChoice(true);
  }, []);

  return (
    <TourContext.Provider value={{ startTour, isTourActive: active }}>
      {children}
      {showChoice && <TourChoiceDialog onChoice={handleChoice} />}
    </TourContext.Provider>
  );
}
