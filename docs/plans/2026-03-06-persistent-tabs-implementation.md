# Persistent Tabs PWA Performance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make main page navigation instant by keeping all 5 tab pages persistently mounted and switching via CSS.

**Architecture:** AppShell becomes a tab container that renders all main pages simultaneously. Tab switching uses `display:none`/`display:contents` + `history.pushState`. Subpages (series detail, reader) use normal Next.js routing. Service worker extended with static asset caching and navigation stale-while-revalidate.

**Tech Stack:** Next.js 16, React 19, TypeScript, Service Worker

---

### Task 1: Add named exports to all tab page components

Each page component currently only has a `default` export. We need named exports so AppShell can import them directly while keeping the default export for Next.js file-based routing.

**Files:**
- Modify: `src/app/page.tsx:79` — add named export
- Modify: `src/app/add/page.tsx:35` — add named export
- Modify: `src/app/stats/page.tsx:33` — add named export
- Modify: `src/app/bookmarks/page.tsx:11` — add named export
- Modify: `src/app/install/page.tsx:43` — add named export

**Step 1: Add named exports**

In each file, change `export default function` to `export function`, then add a separate default export at the bottom. Example for `src/app/page.tsx`:

```tsx
// Line 79: change from
export default function LibraryPage() {
// to
export function LibraryPage() {

// Add at end of file:
export default LibraryPage;
```

Apply this pattern to all 5 files:
- `LibraryPage` in `src/app/page.tsx`
- `AddSeriesPage` in `src/app/add/page.tsx`
- `StatsPage` in `src/app/stats/page.tsx`
- `BookmarksPage` in `src/app/bookmarks/page.tsx`
- `InstallPage` in `src/app/install/page.tsx`

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/app/page.tsx src/app/add/page.tsx src/app/stats/page.tsx src/app/bookmarks/page.tsx src/app/install/page.tsx
git commit -m "refactor: add named exports to tab page components"
```

---

### Task 2: Restructure AppShell as tab container

This is the core change. AppShell will import all 5 tab components, render them persistently, and switch visibility via CSS.

**Files:**
- Modify: `src/components/layout/AppShell.tsx`

**Step 1: Add imports and define tab paths**

At the top of AppShell.tsx, add:

```tsx
import { LibraryPage } from "@/app/page";
import { AddSeriesPage } from "@/app/add/page";
import { StatsPage } from "@/app/stats/page";
import { BookmarksPage } from "@/app/bookmarks/page";
import { InstallPage } from "@/app/install/page";

const TAB_PATHS = ["/", "/add", "/stats", "/bookmarks", "/install"] as const;
type TabPath = (typeof TAB_PATHS)[number];

function isTabPath(path: string): path is TabPath {
  return (TAB_PATHS as readonly string[]).includes(path);
}
```

**Step 2: Add tab state and navigation logic**

Inside the `AppShell` component, add:

```tsx
const [activeTab, setActiveTab] = useState<TabPath>(() => {
  return isTabPath(pathname) ? pathname : "/";
});

// Track which tabs have been visited (for lazy mounting)
const [mountedTabs, setMountedTabs] = useState<Set<TabPath>>(() => new Set(["/"]));

const isOnTabPage = isTabPath(pathname);

// Sync activeTab when pathname changes (e.g. browser back to a tab)
useEffect(() => {
  if (isTabPath(pathname)) {
    setActiveTab(pathname);
    setMountedTabs((prev) => {
      if (prev.has(pathname)) return prev;
      const next = new Set(prev);
      next.add(pathname);
      return next;
    });
  }
}, [pathname]);

const navigateTab = useCallback((path: TabPath) => {
  setActiveTab(path);
  setMountedTabs((prev) => {
    if (prev.has(path)) return prev;
    const next = new Set(prev);
    next.add(path);
    return next;
  });
  window.history.pushState(null, "", path);
}, []);
```

**Step 3: Replace the main content area**

Replace the current `<motion.main>` block with:

```tsx
<main
  className="mx-auto w-full max-w-5xl px-4 pt-6 md:pb-8"
  style={{ paddingBottom: "calc(6rem + var(--sab))", paddingLeft: "max(1rem, var(--sal))", paddingRight: "max(1rem, var(--sar))" }}
>
  {/* Persistent tabs */}
  <div style={{ display: isOnTabPage && activeTab === "/" ? "contents" : "none" }}>
    {mountedTabs.has("/") && <LibraryPage />}
  </div>
  <div style={{ display: isOnTabPage && activeTab === "/add" ? "contents" : "none" }}>
    {mountedTabs.has("/add") && <AddSeriesPage />}
  </div>
  <div style={{ display: isOnTabPage && activeTab === "/stats" ? "contents" : "none" }}>
    {mountedTabs.has("/stats") && <StatsPage />}
  </div>
  <div style={{ display: isOnTabPage && activeTab === "/bookmarks" ? "contents" : "none" }}>
    {mountedTabs.has("/bookmarks") && <BookmarksPage />}
  </div>
  <div style={{ display: isOnTabPage && activeTab === "/install" ? "contents" : "none" }}>
    {mountedTabs.has("/install") && <InstallPage />}
  </div>

  {/* Subpages via Next.js router */}
  {!isOnTabPage && children}
</main>
```

**Step 4: Remove the motion import and fade-up animation**

Remove from imports: `motion`, `fadeUpVariants`, `motionOrInstant`, `useReducedMotion` (only if no longer used elsewhere in the file — `useReducedMotion` is not used elsewhere, `motion` is not used elsewhere after removing `motion.main`).

Keep `reduced` state only if the header still uses it. Check: it doesn't. Remove `const reduced = useReducedMotion();`.

**Step 5: Update `isSubpage` logic**

The existing `isSubpage` is used for the back button. Update it:

```tsx
const isSubpage = !isTabPath(pathname) && pathname !== "/";
```

This ensures the back button shows on `/series/[slug]` etc. but not on tab pages.

**Step 6: Pass navigateTab to children that need it**

The `handleBack` function should also handle going back to a tab:

```tsx
const handleBack = () => {
  if (window.history.length > 1) {
    router.back();
  } else {
    navigateTab("/");
  }
};
```

**Step 7: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 8: Commit**

```bash
git add src/components/layout/AppShell.tsx
git commit -m "feat: restructure AppShell as persistent tab container"
```

---

### Task 3: Update MobileNav to use tab navigation

MobileNav currently uses `<Link>` for navigation. Change to `onClick` with `history.pushState`.

**Files:**
- Modify: `src/components/layout/MobileNav.tsx`

**Step 1: Accept onNavigate prop and replace Link with button**

```tsx
"use client";

import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { BarChart3, BookOpen, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Library", icon: BookOpen, tourId: "mobile-library" },
  { href: "/add", label: "Add", icon: PlusCircle, tourId: "mobile-add" },
  { href: "/stats", label: "Stats", icon: BarChart3, tourId: "mobile-stats" },
];

interface MobileNavProps {
  onNavigate?: (path: string) => void;
}

export function MobileNav({ onNavigate }: MobileNavProps) {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/70 bg-card/95 px-3 pb-2 pt-2 backdrop-blur md:hidden"
      style={{ paddingBottom: "max(0.5rem, var(--sab))", paddingLeft: "max(0.75rem, var(--sal))", paddingRight: "max(0.75rem, var(--sar))" }}
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-xl items-center justify-between gap-2">
        {items.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;

          return (
            <li key={item.href} className="flex-1">
              <button
                type="button"
                data-tour={item.tourId}
                aria-current={active ? "page" : undefined}
                onClick={() => onNavigate?.(item.href)}
                className={cn(
                  "relative flex w-full items-center justify-center gap-1.5 overflow-hidden rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="mobile-nav-active"
                    className="absolute inset-0 rounded-xl bg-primary"
                    transition={{ duration: 0.22, ease: [0.22, 0.8, 0.2, 1] }}
                  />
                ) : null}
                <Icon className="relative z-10 h-5 w-5" />
                <span className="relative z-10">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

**Step 2: In AppShell, pass navigateTab to MobileNav**

```tsx
<MobileNav onNavigate={(path) => navigateTab(path as TabPath)} />
```

**Step 3: Update desktop header links for tab paths**

In AppShell's header, change the `/add` and `/stats` `<Link>` elements to buttons that call `navigateTab`:

```tsx
// Replace <Link href="/add" ...> with:
<button
  type="button"
  onClick={() => navigateTab("/add")}
  data-tour="nav-add"
  className={cn(
    "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
    pathname === "/add"
      ? "bg-primary text-primary-foreground"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  )}
>
  <PlusCircle className="h-4 w-4" />
  Add
</button>

// Same pattern for /stats
```

Also update the Logo/Title center link — instead of `<Link href="/">`, use:
```tsx
<button type="button" onClick={() => navigateTab("/")} className="flex items-center gap-2">
```

**Step 4: Remove unused `Link` import if no longer needed in AppShell**

Check if `Link` is still used in AppShell (it won't be after converting all nav to buttons). Remove import if unused.

**Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add src/components/layout/MobileNav.tsx src/components/layout/AppShell.tsx
git commit -m "feat: update navigation to use persistent tab switching"
```

---

### Task 4: Handle popstate for browser Back/Forward

When the user presses browser Back/Forward and lands on a tab path, we need to update the active tab without a full navigation.

**Files:**
- Modify: `src/components/layout/AppShell.tsx`

**Step 1: Add popstate listener**

Inside AppShell, add a useEffect:

```tsx
useEffect(() => {
  const handlePopState = () => {
    const path = window.location.pathname;
    if (isTabPath(path)) {
      setActiveTab(path);
      setMountedTabs((prev) => {
        if (prev.has(path)) return prev;
        const next = new Set(prev);
        next.add(path);
        return next;
      });
    }
    // Non-tab paths: Next.js router handles it automatically
  };

  window.addEventListener("popstate", handlePopState);
  return () => window.removeEventListener("popstate", handlePopState);
}, []);
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Manual test**

1. Open app, navigate Library → Add → Stats using tabs
2. Press browser Back — should go to Add (instant)
3. Press browser Back — should go to Library (instant)
4. Press browser Forward — should go to Add (instant)
5. Navigate to a series page, press Back — should return to the last tab

**Step 4: Commit**

```bash
git add src/components/layout/AppShell.tsx
git commit -m "feat: handle popstate for browser back/forward on tabs"
```

---

### Task 5: Enhance Service Worker caching

Add static asset caching and navigation stale-while-revalidate.

**Files:**
- Modify: `public/sw.js`

**Step 1: Add static asset cache-first strategy**

Add this block BEFORE the existing font caching block (after the fetch event listener starts):

```js
// Next.js static assets: cache-first (content-hashed, immutable)
if (url.pathname.startsWith("/_next/static/")) {
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        });
      })
    )
  );
  return;
}
```

**Step 2: Change navigation strategy to stale-while-revalidate**

Replace the existing navigation block:

```js
// Navigation: stale-while-revalidate (instant from cache, update in background)
if (event.request.mode === "navigate") {
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((response) => {
          if (response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(() => {
          // Offline: return cached or error
          if (cached) return cached;
          return new Response("Offline", { status: 503 });
        });

        // Return cached immediately if available, otherwise wait for network
        return cached || fetchPromise;
      })
    )
  );
  return;
}
```

**Step 3: Bump SW_VERSION**

Change line 1:
```js
const SW_VERSION = "v2-persistent-tabs";
```

**Step 4: Commit**

```bash
git add public/sw.js
git commit -m "feat: enhance service worker with static caching and stale-while-revalidate navigation"
```

---

### Task 6: Add prefetch on hover/touch for series cards

When the user hovers or touches a series card in the Library, prefetch the series detail route.

**Files:**
- Modify: `src/app/page.tsx` — find the series card `<Link>` element

**Step 1: Find the series card Link in page.tsx**

Search for the `<Link href={/series/${...}}` in the library page. Add `onMouseEnter` and `onTouchStart` handlers that call `router.prefetch()`.

This requires adding `useRouter` to the library page. Since the LibraryPage doesn't currently use `useRouter`, add it:

```tsx
import { useRouter } from "next/navigation";

// Inside LibraryPage:
const router = useRouter();
```

Then on each series card `<Link>`:
```tsx
<Link
  href={`/series/${s.slug}`}
  onMouseEnter={() => router.prefetch(`/series/${s.slug}`)}
  onTouchStart={() => router.prefetch(`/series/${s.slug}`)}
  // ... existing props
>
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: prefetch series detail route on hover/touch"
```

---

### Task 7: Final verification and cleanup

**Step 1: Full build check**

Run: `npx tsc --noEmit && npx next build`
Expected: No errors

**Step 2: Manual smoke test**

Test these flows:
1. Library → Add → Stats → Bookmarks → Install — all instant (no flash, no skeleton, no network)
2. Search something in Add, switch to Library, switch back to Add — search input preserved
3. Scroll down in Library, switch to Stats, switch back — scroll position preserved
4. Open a series detail page — normal navigation (may have brief load)
5. Back from series to Library — instant (tab was preserved)
6. Browser Back/Forward through tabs — all instant
7. Reader → Back — returns to correct tab
8. Offline mode — tabs still work, cached pages load

**Step 3: Commit final state**

```bash
git add -A
git commit -m "feat: persistent tabs for instant PWA navigation

- All 5 main pages rendered persistently, switched via CSS display
- Tab navigation uses history.pushState instead of full page navigation
- Service worker caches static assets and uses stale-while-revalidate for navigation
- Series card prefetch on hover/touch
- Scroll position and form state preserved across tab switches"
```
