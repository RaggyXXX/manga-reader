# Persistent Tabs PWA Performance Design

**Date:** 2026-03-06
**Goal:** Make page transitions feel instant/native by keeping main pages persistently mounted and switching via CSS.

## Problem

Every page transition triggers a server roundtrip (RSC payload), JS chunk load, re-render, and fade-up animation. This creates 200-500ms of perceived lag on every navigation — feels like a website, not a native app.

## Solution: Persistent Tabs + Service Worker Enhancements

### 1. Persistent Tabs Architecture

AppShell renders all 5 main pages simultaneously, toggling visibility via CSS (`display:none` / `display:contents`).

**Persistent tabs:**
- `/` — Library
- `/add` — Search / Add Series
- `/stats` — Statistics
- `/bookmarks` — Bookmarks
- `/install` — PWA Install

**Normal Next.js routing (subpages):**
- `/series/[slug]` — Series detail
- `/read/[slug]/[chapter]` — Reader
- `/share` — Share import

### 2. AppShell Restructure

```
<AppShell>
  <Header />
  <main>
    <div style={display: tab==="/"}>        <LibraryPage />      </div>
    <div style={display: tab==="/add"}>     <AddSeriesPage />    </div>
    <div style={display: tab==="/stats"}>   <StatsPage />        </div>
    <div style={display: tab==="/bookmarks"}> <BookmarksPage />  </div>
    <div style={display: tab==="/install"}>  <InstallPage />     </div>

    {isSubpage && children}
  </main>
  <MobileNav onNavigate={setTab} />
</AppShell>
```

**Key details:**
- `activeTab` string state, derived from initial pathname
- Lazy mount: only `/` mounts immediately, others mount on first visit and stay mounted
- MobileNav + Header links use `onClick` + `history.pushState` instead of `<Link>`
- `popstate` listener for browser Back/Forward — check if URL is a tab path, update state accordingly
- When pathname is a subpage, all tabs are hidden and `{children}` (Next.js router) is shown
- Scroll position, search input, filters all preserved across tab switches

### 3. Navigation Changes

- MobileNav: `onClick={() => navigate(path)}` instead of `<Link href={path}>`
- Header links: same pattern
- `navigate()` function: `setActiveTab(path)` + `history.pushState(null, "", path)`
- Subpage links (`/series/[slug]`, `/read/...`) continue using Next.js `<Link>`

### 4. Animation Changes

- Remove `motion.main` fade-up animation for tab switches (0ms transition)
- Optional: keep a brief 50ms fade for subpage transitions only

### 5. Service Worker Enhancements

- **Static assets** (`/_next/static/`): cache-first (content-hashed, immutable)
- **Navigation requests**: stale-while-revalidate (serve cached shell instantly, update in background)
- **App shell precaching**: cache the HTML shell on first visit

### 6. Prefetch for Subpages

- `router.prefetch()` on hover/touch of Series cards in Library
- Preloads the route chunk before the user taps

## Files Changed

- `src/components/layout/AppShell.tsx` — Main restructure to tab container
- `src/components/layout/MobileNav.tsx` — onClick instead of Link
- `src/app/page.tsx` — Named export for import into AppShell
- `src/app/add/page.tsx` — Named export
- `src/app/stats/page.tsx` — Named export
- `src/app/bookmarks/page.tsx` — Named export
- `src/app/install/page.tsx` — Named export
- `src/app/layout.tsx` — Children handling adjustment
- `public/sw.js` — Extended caching strategies

## What Does NOT Change

- Page component internals stay identical
- localStorage logic unchanged
- Reader, Series detail, Share remain normal Next.js routing
- SyncContext, TourContext stay in layout
- API routes unchanged
