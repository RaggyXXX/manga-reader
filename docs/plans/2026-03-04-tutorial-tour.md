# Tutorial Tour Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a multi-page interactive tutorial tour using Driver.js that guides new users through the app's key features (Library, Add, Series).

**Architecture:** Driver.js (MIT, ~5KB) provides spotlight overlay + popover tooltips. A `TourProvider` context manages tour state across page navigations. Tour auto-starts on first visit (localStorage flag), and can be restarted from the Stats page. Steps are defined declaratively with `data-tour` attributes on target elements.

**Tech Stack:** Driver.js, React Context, Next.js router, localStorage

---

### Task 1: Install Driver.js

**Step 1: Install the package**

Run: `npm install driver.js`

**Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add driver.js for tutorial tour"
```

---

### Task 2: Add `data-tour` attributes to target elements

**Files:**
- Modify: `src/components/layout/AppShell.tsx` (desktop Add link)
- Modify: `src/app/page.tsx` (toolbar, empty-state add button)
- Modify: `src/app/add/page.tsx` (search input, URL tab)
- Modify: `src/app/series/[slug]/page.tsx` (sync button, share+favorite buttons)

**Step 1: AppShell — Add nav link**

In `src/components/layout/AppShell.tsx`, on the desktop "Add" `<Link>` (~line 80), add `data-tour="nav-add"`:

```tsx
<Link
  href="/add"
  data-tour="nav-add"
  className={cn(...)}
>
```

**Step 2: Library page — toolbar and empty-state**

In `src/app/page.tsx`:

On the toolbar `<div>` wrapper (~line 213, the `<div className="flex flex-wrap items-center gap-2">`), add `data-tour="library-toolbar"`:

```tsx
<div className="flex flex-wrap items-center gap-2" data-tour="library-toolbar">
```

On the empty-state "Add Series" `<Link>` (~line 203), add `data-tour="library-add-empty"`:

```tsx
<Link href="/add" className="mt-5" data-tour="library-add-empty">
```

**Step 3: Add page — search input and URL tab**

In `src/app/add/page.tsx`:

On the search `<TabsTrigger value="search">` (~line 60), add `data-tour="add-search-tab"`:

```tsx
<TabsTrigger value="search" data-tour="add-search-tab">
```

On the URL `<TabsTrigger value="url">` (~line 63), add `data-tour="add-url-tab"`:

```tsx
<TabsTrigger value="url" data-tour="add-url-tab">
```

**Step 4: Series page — sync and share+favorite**

In `src/app/series/[slug]/page.tsx`:

On the sync button (~line 143, `<Button size="sm" variant="secondary"`), add `data-tour="series-sync"`:

```tsx
<Button
  size="sm"
  variant="secondary"
  type="button"
  data-tour="series-sync"
  onClick={() => (isSyncing ? stopSync() : startSync(slug))}
>
```

On the `<div className="flex shrink-0 gap-1">` wrapper around share+favorite (~line 125), add `data-tour="series-share-fav"`:

```tsx
<div className="flex shrink-0 gap-1" data-tour="series-share-fav">
```

**Step 5: Commit**

```bash
git add src/components/layout/AppShell.tsx src/app/page.tsx src/app/add/page.tsx src/app/series/[slug]/page.tsx
git commit -m "feat: add data-tour attributes to UI elements for tutorial"
```

---

### Task 3: Create TourProvider context and tour step definitions

**Files:**
- Create: `src/contexts/TourContext.tsx`

**Step 1: Create the TourProvider**

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { driver, type DriveStep, type Driver } from "driver.js";
import "driver.js/dist/driver.css";

const TOUR_DONE_KEY = "tour-completed";
const TOUR_STEP_KEY = "tour-current-step";

interface TourContextValue {
  startTour: () => void;
  isTourActive: boolean;
}

const TourContext = createContext<TourContextValue>({ startTour: () => {}, isTourActive: false });

export function useTour() {
  return useContext(TourContext);
}

// Tour phases: each phase runs on a specific page
interface TourPhase {
  path: string; // page path to navigate to
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
            description: "Filter your library by source, status, or favorites. Sort by last read, name, and more.",
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
            description: "Your library is empty. Tap here to add your first manga series!",
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
          description: "Search for manga across all supported sources — MangaDex, MangaKatana, VyManga, and Manhwazone.",
          side: "bottom",
          align: "start",
        },
      },
      {
        element: '[data-tour="add-url-tab"]',
        popover: {
          title: "Add by URL",
          description: "Or paste a direct link to a manga series page from any supported source.",
          side: "bottom",
          align: "start",
        },
      },
    ],
  });

  // Phase 3: Series page (only if library has series)
  // This phase is skipped if library is empty — the path is set dynamically
  // when startTour is called.

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

  const cleanup = useCallback(() => {
    driverRef.current?.destroy();
    driverRef.current = null;
    setActive(false);
    phaseIndexRef.current = 0;
    awaitingNavRef.current = false;
    sessionStorage.removeItem(TOUR_STEP_KEY);
  }, []);

  const runPhase = useCallback((phaseIdx: number) => {
    const phases = phasesRef.current;
    if (phaseIdx >= phases.length) {
      // Tour complete
      localStorage.setItem(TOUR_DONE_KEY, "true");
      cleanup();
      return;
    }

    const phase = phases[phaseIdx];
    phaseIndexRef.current = phaseIdx;

    // Destroy previous driver instance
    driverRef.current?.destroy();

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
      onDestroyed: () => {
        // If tour was dismissed (not completed), mark done anyway
        if (active) {
          localStorage.setItem(TOUR_DONE_KEY, "true");
          cleanup();
        }
      },
      onDestroyStarted: () => {
        if (!driverRef.current?.hasNextStep()) {
          // Last step of this phase completed — move to next phase
          driverRef.current?.destroy();
          const nextIdx = phaseIdx + 1;
          if (nextIdx < phases.length) {
            awaitingNavRef.current = true;
            phaseIndexRef.current = nextIdx;
            sessionStorage.setItem(TOUR_STEP_KEY, String(nextIdx));
            router.push(phases[nextIdx].path);
          } else {
            localStorage.setItem(TOUR_DONE_KEY, "true");
            cleanup();
          }
        } else {
          driverRef.current?.destroy();
        }
      },
    });

    // Small delay to let DOM render target elements
    setTimeout(() => {
      driverRef.current?.drive();
    }, 400);
  }, [active, cleanup, router]);

  // Resume tour after navigation
  useEffect(() => {
    if (!awaitingNavRef.current) return;
    const phases = phasesRef.current;
    const idx = phaseIndexRef.current;

    if (idx < phases.length && pathname === phases[idx].path) {
      awaitingNavRef.current = false;
      // Wait for page to render
      setTimeout(() => runPhase(idx), 500);
    }
  }, [pathname, runPhase]);

  // Auto-start on first visit
  useEffect(() => {
    if (typeof window === "undefined") return;
    const done = localStorage.getItem(TOUR_DONE_KEY);
    if (!done && pathname === "/") {
      // Small delay for initial render
      const timer = setTimeout(() => {
        startTourInternal();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startTourInternal = useCallback(() => {
    // Check if library has series
    const hasLibrary = !!localStorage.getItem("manga-series") &&
      Object.keys(JSON.parse(localStorage.getItem("manga-series") || "{}")).length > 0;

    const phases = buildTourPhases(hasLibrary);

    // If library has series, add series detail phase
    if (hasLibrary) {
      const seriesMap = JSON.parse(localStorage.getItem("manga-series") || "{}");
      const firstSlug = Object.keys(seriesMap)[0];
      if (firstSlug) {
        phases.push({
          path: `/series/${firstSlug}`,
          steps: [
            {
              element: '[data-tour="series-sync"]',
              popover: {
                title: "Sync Chapters",
                description: "Download chapter data for offline reading. Syncs run in the background.",
                side: "top",
                align: "start",
              },
            },
            {
              element: '[data-tour="series-share-fav"]',
              popover: {
                title: "Share & Favorite",
                description: "Share this series with friends or mark it as a favorite for quick access.",
                side: "left",
                align: "start",
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
    // Reset tour state for manual restart
    localStorage.removeItem(TOUR_DONE_KEY);
    startTourInternal();
  }, [startTourInternal]);

  return (
    <TourContext.Provider value={{ startTour, isTourActive: active }}>
      {children}
    </TourContext.Provider>
  );
}
```

**Step 2: Commit**

```bash
git add src/contexts/TourContext.tsx
git commit -m "feat: add TourProvider with driver.js multi-page tour"
```

---

### Task 4: Add custom CSS for Driver.js popovers

**Files:**
- Modify: `src/app/globals.css`

**Step 1: Add tour styles at the end of globals.css**

```css
/* Driver.js tour customization */
.driver-popover.manga-tour-popover {
  background: hsl(var(--card));
  color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border));
  border-radius: 16px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
  padding: 20px;
  max-width: 320px;
}

.driver-popover.manga-tour-popover .driver-popover-title {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  color: hsl(var(--foreground));
}

.driver-popover.manga-tour-popover .driver-popover-description {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  line-height: 1.5;
  margin-top: 6px;
}

.driver-popover.manga-tour-popover .driver-popover-navigation-btns {
  gap: 8px;
  margin-top: 16px;
}

.driver-popover.manga-tour-popover .driver-popover-next-btn {
  background: linear-gradient(135deg, #e8a849, #d4783a);
  color: white;
  border: none;
  border-radius: 10px;
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 600;
  text-shadow: none;
}

.driver-popover.manga-tour-popover .driver-popover-prev-btn {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 600;
  text-shadow: none;
}

.driver-popover.manga-tour-popover .driver-popover-close-btn {
  color: hsl(var(--muted-foreground));
}

.driver-popover.manga-tour-popover .driver-popover-progress-text {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.driver-popover.manga-tour-popover .driver-popover-arrow-side-left.driver-popover-arrow,
.driver-popover.manga-tour-popover .driver-popover-arrow-side-right.driver-popover-arrow,
.driver-popover.manga-tour-popover .driver-popover-arrow-side-top.driver-popover-arrow,
.driver-popover.manga-tour-popover .driver-popover-arrow-side-bottom.driver-popover-arrow {
  border-color: hsl(var(--border));
}
```

**Step 2: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: add custom CSS for tour popovers matching brand theme"
```

---

### Task 5: Wire TourProvider into layout and add restart button to Stats

**Files:**
- Modify: `src/app/layout.tsx` (wrap with TourProvider)
- Modify: `src/app/stats/page.tsx` (add "Start Tour" button)

**Step 1: Add TourProvider to layout.tsx**

In `src/app/layout.tsx`, import TourProvider and wrap inside SyncProvider:

```tsx
import { TourProvider } from "@/contexts/TourContext";
```

Wrap `<ToastProvider>` with `<TourProvider>`:

```tsx
<SyncProvider>
  <SyncProgressBar />
  <TourProvider>
    <ToastProvider>
      <AppShell>{children}</AppShell>
    </ToastProvider>
  </TourProvider>
</SyncProvider>
```

**Step 2: Add restart button to Stats page**

In `src/app/stats/page.tsx`, import useTour and HelpCircle:

```tsx
import { BarChart3, BookOpen, Clock3, Database, HelpCircle, Images } from "lucide-react";
import { useTour } from "@/contexts/TourContext";
```

Inside `StatsPage`, add:

```tsx
const { startTour } = useTour();
```

After the "Offline Storage" `<Card>` (before the closing `</div>`), add:

```tsx
<Card>
  <CardContent className="flex items-center justify-between p-4">
    <div>
      <p className="font-medium">App Tour</p>
      <p className="text-sm text-muted-foreground">Learn how to use Manga Blast</p>
    </div>
    <Button variant="outline" size="sm" onClick={startTour}>
      <HelpCircle className="mr-1 h-4 w-4" />
      Start Tour
    </Button>
  </CardContent>
</Card>
```

**Step 3: Run build**

Run: `npx next build`
Expected: Build succeeds with no errors.

**Step 4: Commit**

```bash
git add src/app/layout.tsx src/app/stats/page.tsx
git commit -m "feat: wire tour into layout, add restart button on stats page"
```

---

### Task 6: Final verification and deploy

**Step 1: Run build**

Run: `npx next build`
Expected: Build succeeds, `/share` and all routes listed.

**Step 2: Push to deploy**

```bash
git push
```
