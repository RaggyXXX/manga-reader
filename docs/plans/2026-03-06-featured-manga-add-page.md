# Featured Manga Add Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show 20 currently popular manga on the add/search page before the user has searched, using the existing preview and add flow.

**Architecture:** Add a small server API that fetches and normalizes featured manga into the existing `SearchResult` shape. Render a dedicated featured card grid on the add page only when the query is empty, and route card clicks through the existing preview modal flow so add behavior stays consistent.

**Tech Stack:** Next.js App Router, React, Playwright, existing search/preview components

---

### Task 1: Featured API

**Files:**
- Create: `src/app/api/featured/route.ts`
- Modify: `src/app/api/search/route.ts`
- Test: `tests/ui/featured.spec.ts`

**Step 1: Write the failing test**

Add a Playwright test that loads `/add` with an empty query and expects a visible `Featured` section with card items.

**Step 2: Run test to verify it fails**

Run: `npx playwright test tests/ui/featured.spec.ts --project=chromium --workers=1`
Expected: FAIL because the featured section does not exist yet.

**Step 3: Write minimal implementation**

Create a featured API that returns 20 popular manga from a primary source in the existing `SearchResult` shape.

**Step 4: Run test to verify it passes**

Run: `npx playwright test tests/ui/featured.spec.ts --project=chromium --workers=1`
Expected: PASS

### Task 2: Add Page Featured UI

**Files:**
- Modify: `src/app/add/page.tsx`
- Create: `src/components/FeaturedMangaCard.tsx`
- Test: `tests/ui/featured.spec.ts`

**Step 1: Write the failing test**

Extend the Playwright test to assert that clicking a featured card opens the existing preview/add modal.

**Step 2: Run test to verify it fails**

Run: `npx playwright test tests/ui/featured.spec.ts --project=chromium --workers=1`
Expected: FAIL because featured cards and preview behavior are not wired yet.

**Step 3: Write minimal implementation**

Fetch featured data on the add page for the empty state, render card-based UI, and reuse `handleClickResult` plus `PreviewModal`.

**Step 4: Run test to verify it passes**

Run: `npx playwright test tests/ui/featured.spec.ts --project=chromium --workers=1`
Expected: PASS

### Task 3: Regression Coverage

**Files:**
- Modify: `tests/ui/routes-smoke.spec.ts`
- Test: `tests/ui/routes-smoke.spec.ts`

**Step 1: Write or adjust failing coverage if needed**

Add or adjust add-page assertions only if the new featured section changes existing expectations.

**Step 2: Run targeted regression tests**

Run: `npx playwright test tests/ui/routes-smoke.spec.ts --grep "add route renders|add page exposes search and url tabs" --project=chromium --workers=1`
Expected: PASS

**Step 3: Commit**

```bash
git add src/app/api/featured/route.ts src/app/add/page.tsx src/components/FeaturedMangaCard.tsx tests/ui/featured.spec.ts docs/plans/2026-03-06-featured-manga-add-page.md
git commit -m "feat: add featured manga to add page"
```
