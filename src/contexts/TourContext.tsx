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

  // Inject demo reading progress so stats page shows metrics
  const now = Date.now();
  const progressMap = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
  if (!progressMap[DEMO_SLUG]) {
    progressMap[DEMO_SLUG] = {
      lastReadChapter: 2,
      readChapters: [1, 2],
      chapterProgress: {
        1: { scrollPercent: 100, imageIndex: 12, timestamp: now - 3600000 },
        2: { scrollPercent: 45, imageIndex: 5, timestamp: now - 600000 },
      },
    };
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progressMap));
  }

  // Inject demo bookmarks so bookmarks page shows content
  const bookmarksMap = JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || "{}");
  if (!bookmarksMap[DEMO_SLUG]) {
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
  }

  // Notify components to refresh their state from localStorage
  window.dispatchEvent(new Event("tour-storage-updated"));
}

function removeDemoManga() {
  const seriesMap = JSON.parse(localStorage.getItem(SERIES_KEY) || "{}");
  delete seriesMap[DEMO_SLUG];
  localStorage.setItem(SERIES_KEY, JSON.stringify(seriesMap));

  const chaptersMap = JSON.parse(localStorage.getItem(CHAPTERS_KEY) || "{}");
  delete chaptersMap[DEMO_SLUG];
  localStorage.setItem(CHAPTERS_KEY, JSON.stringify(chaptersMap));

  // Remove demo reading progress
  const progressMap = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
  delete progressMap[DEMO_SLUG];
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progressMap));

  // Remove demo bookmarks
  const bookmarksMap = JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || "{}");
  delete bookmarksMap[DEMO_SLUG];
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarksMap));

  // Notify components to refresh their state from localStorage
  window.dispatchEvent(new Event("tour-storage-updated"));
}

// --- Tour phase definitions ---

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

  // Phase 3: Series detail
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

function buildLongTourPhases(hasRealLibrary: boolean): TourPhase[] {
  const phases: TourPhase[] = [];

  // Phase 1: Library page
  const librarySteps: DriveStep[] = [
    {
      popover: {
        title: "Welcome to Manga Blast!",
        description: hasRealLibrary
          ? "Let's explore everything Manga Blast has to offer. This is your library — all your added series live here."
          : "Let's take the full tour! We've added an example manga so you can see all features in action.",
      },
    },
    ...(hasRealLibrary
      ? [
          {
            element: '[data-tour="library-quick-continue"]',
            popover: {
              title: "Quick Continue",
              description: "Jump back in — continue exactly where you left off with one tap.",
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
        description: "Filter to only show your favorited series.",
        side: "bottom",
        align: "start",
      },
    },
    {
      element: '[data-tour="library-view-toggle"]',
      popover: {
        title: "Grid / List View",
        description: "Switch between grid and list view for your library.",
        side: "bottom",
        align: "end",
      },
    },
  ];
  phases.push({ path: "/", steps: librarySteps });

  // Phase 2: Add page
  phases.push({
    path: "/add",
    steps: [
      {
        element: '[data-tour="add-search-tab"]',
        popover: {
          title: "Search",
          description: "Search across all supported sources — MangaDex, MangaKatana, VyManga, and Manhwazone.",
          side: "bottom",
          align: "start",
        },
      },
      {
        element: '[data-tour="add-url-tab"]',
        popover: {
          title: "Add by URL",
          description: "Paste a direct link to add any manga from a supported source.",
          side: "bottom",
          align: "start",
        },
      },
    ],
  });

  // Phase 3: Series detail
  phases.push({
    path: `/series/${DEMO_SLUG}`,
    steps: [
      {
        element: '[data-tour="series-reading-status"]',
        popover: {
          title: "Reading Status",
          description: "Track your progress — Reading, Plan to Read, Completed, On Hold, or Dropped.",
          side: "bottom",
          align: "start",
        },
      },
      {
        element: '[data-tour="series-sync"]',
        popover: {
          title: "Download & Update",
          description:
            'Tap "Download all" to save chapters for offline reading. When new chapters are available, the button changes to "Update".',
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
      {
        element: '[data-tour="series-chapter-list"]',
        popover: {
          title: "Chapter List",
          description: "Browse, search, and sort chapters. Filter to show only unread chapters.",
          side: "top",
          align: "center",
        },
      },
    ],
  });

  // Phase 4: Bookmarks
  phases.push({
    path: "/bookmarks",
    steps: [
      {
        element: '[data-tour="bookmarks-grid"]',
        popover: {
          title: "Bookmarks",
          description: "Your saved pages appear here as thumbnails. Long-press any page while reading to bookmark it.",
          side: "bottom",
          align: "center",
        },
      },
    ],
  });

  // Phase 5: Stats
  phases.push({
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
          description: "Manage cached chapter data per series. Clear individual or all caches.",
          side: "top",
          align: "center",
        },
      },
    ],
  });

  // Phase 6: Install guide
  phases.push({
    path: "/install",
    steps: [
      {
        element: '[data-tour="install-page"]',
        popover: {
          title: "Install Manga Blast",
          description: "Add Manga Blast to your home screen for the full experience — fullscreen reading, offline access, and native app feel.",
          side: "bottom",
          align: "center",
        },
      },
    ],
  });

  return phases;
}

// --- Choice Dialog ---

function TourChoiceDialog({ onChoice }: { onChoice: (mode: TourMode) => void }) {
  // Block Escape key
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
              Quick overview of the essentials — ~2 min
            </p>
          </button>

          <button
            type="button"
            onClick={() => onChoice("long")}
            className="w-full rounded-xl border-2 border-primary bg-primary/5 px-4 py-3.5 text-left transition-colors hover:bg-primary/10"
          >
            <p className="font-semibold text-foreground">Long Tour</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Full walkthrough of all features — ~5 min
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Provider ---

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
        doneBtnText: isLastPhase ? "Done!" : "Next Page \u2192",
        progressText: "",
        allowClose: false,
        disableButtons: ["close"],
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
          }
          // No else branch — cannot close early
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
        setShowChoice(true);
      }, 1200);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startTourWithMode = useCallback(
    (mode: TourMode) => {
      setShowChoice(false);

      // Inject demo manga so all steps are available
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
