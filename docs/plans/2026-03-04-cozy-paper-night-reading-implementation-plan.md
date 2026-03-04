# Cozy Paper + Night Reading Frontend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a distinctive cozy-paper visual system with a cohesive night mode, subtle Framer Motion polish, and clearer UX hierarchy across core user flows.

**Architecture:** Extend the existing token-based shadcn/Tailwind design system first, then refactor shell/navigation and page-level components to consume those tokens. Centralize motion variants in `src/lib/motion.ts` and apply them consistently to route sections, cards, and navigation indicators while preserving reader focus and reduced-motion fallbacks.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, shadcn UI components, Framer Motion, Playwright E2E.

---

### Task 1: Add Theme Preference Infrastructure

**Files:**
- Create: `src/lib/theme.ts`
- Modify: `src/app/layout.tsx`
- Test: `tests/ui/routes-smoke.spec.ts`

**Step 1: Write the failing test**

```ts
// tests/ui/routes-smoke.spec.ts
test("theme toggle persists preference", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /theme/i }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- --grep "theme toggle persists preference"`
Expected: FAIL because no theme toggle/persistence exists.

**Step 3: Write minimal implementation**

```ts
// src/lib/theme.ts
export type ThemeMode = "light" | "dark" | "system";
export const THEME_KEY = "manga-theme";

export function resolveInitialTheme(saved: ThemeMode | null, systemDark: boolean): "light" | "dark" {
  if (saved === "light" || saved === "dark") return saved;
  return systemDark ? "dark" : "light";
}
```

```tsx
// src/app/layout.tsx (client effect wrapper or provider hookup)
// On mount: read localStorage, apply/remove `dark` on documentElement.
// On toggle: update class + persist localStorage.
```

**Step 4: Run test to verify it passes**

Run: `npm run test:e2e -- --grep "theme toggle persists preference"`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/theme.ts src/app/layout.tsx tests/ui/routes-smoke.spec.ts
git commit -m "feat: add persisted light/dark theme infrastructure"
```

### Task 2: Implement Cozy Paper + Night Token Sets

**Files:**
- Modify: `src/app/globals.css`
- Test: `tests/ui/routes-smoke.spec.ts`

**Step 1: Write the failing test**

```ts
// tests/ui/routes-smoke.spec.ts
test("dark theme updates app shell surface colors", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /theme/i }).click();
  const shell = page.getByTestId("app-shell").first();
  await expect(shell).toBeVisible();
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- --grep "dark theme updates app shell surface colors"`
Expected: FAIL due to missing toggle + no dark token mapping.

**Step 3: Write minimal implementation**

```css
/* src/app/globals.css */
:root {
  --background: 38 28% 93%;
  --card: 36 30% 96%;
  --foreground: 24 18% 16%;
  --surface-1: 36 24% 95%;
  --surface-2: 34 20% 90%;
}
.dark {
  --background: 28 12% 10%;
  --card: 26 12% 14%;
  --foreground: 34 28% 90%;
  --surface-1: 26 12% 13%;
  --surface-2: 26 10% 18%;
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:e2e -- --grep "dark theme updates app shell surface colors"`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/globals.css tests/ui/routes-smoke.spec.ts
git commit -m "feat: add cozy paper and night mode design tokens"
```

### Task 3: Upgrade App Shell and Mobile Navigation UX

**Files:**
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/components/layout/MobileNav.tsx`
- Modify: `src/lib/motion.ts`
- Test: `tests/ui/routes-smoke.spec.ts`

**Step 1: Write the failing test**

```ts
// tests/ui/routes-smoke.spec.ts
test("mobile nav marks active destination", async ({ page }) => {
  await page.goto("/add");
  await expect(page.getByRole("link", { name: /add/i })).toHaveAttribute("aria-current", "page");
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- --grep "mobile nav marks active destination"`
Expected: FAIL because active link lacks `aria-current` and animated indicator.

**Step 3: Write minimal implementation**

```tsx
// AppShell: add theme toggle button + optional ambient background layer
// MobileNav: add `aria-current={active ? "page" : undefined}`
// and a Framer shared layout indicator for active item.
```

```ts
// src/lib/motion.ts
export const cozyEase = [0.22, 0.8, 0.2, 1] as const;
export const motionDurations = { fast: 0.14, base: 0.22, slow: 0.32 } as const;
```

**Step 4: Run test to verify it passes**

Run: `npm run test:e2e -- --grep "mobile nav marks active destination"`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/layout/AppShell.tsx src/components/layout/MobileNav.tsx src/lib/motion.ts tests/ui/routes-smoke.spec.ts
git commit -m "feat: improve shell navigation hierarchy and motion semantics"
```

### Task 4: Refine Library Information Hierarchy

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/SeriesCard.tsx`
- Modify: `src/components/ContinueReading.tsx`
- Test: `tests/ui/routes-smoke.spec.ts`

**Step 1: Write the failing test**

```ts
// tests/ui/routes-smoke.spec.ts
test("home emphasizes continue reading when progress exists", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /weiterlesen/i })).toBeVisible();
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- --grep "home emphasizes continue reading when progress exists"`
Expected: FAIL if section heading/hierarchy is missing or inconsistent.

**Step 3: Write minimal implementation**

```tsx
// page.tsx: move ContinueReading directly under hero with stronger visual priority.
// SeriesCard.tsx: tune metadata order (title -> progress -> source).
// ContinueReading.tsx: ensure clear heading and single primary resume action.
```

**Step 4: Run test to verify it passes**

Run: `npm run test:e2e -- --grep "home emphasizes continue reading when progress exists"`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/page.tsx src/components/SeriesCard.tsx src/components/ContinueReading.tsx tests/ui/routes-smoke.spec.ts
git commit -m "feat: improve home hierarchy for continue reading workflow"
```

### Task 5: Replace Add-Page Toggle with shadcn Tabs + Sticky Filters

**Files:**
- Modify: `src/app/add/page.tsx`
- Optionally Create: `src/components/ui/tabs.tsx` (if not already present)
- Test: `tests/ui/routes-smoke.spec.ts`

**Step 1: Write the failing test**

```ts
// tests/ui/routes-smoke.spec.ts
test("add page exposes search and url tabs", async ({ page }) => {
  await page.goto("/add");
  await expect(page.getByRole("tab", { name: /suche/i })).toBeVisible();
  await expect(page.getByRole("tab", { name: /url/i })).toBeVisible();
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- --grep "add page exposes search and url tabs"`
Expected: FAIL because current controls are plain buttons.

**Step 3: Write minimal implementation**

```tsx
// add/page.tsx
<Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
  <TabsList>
    <TabsTrigger value="search">Suche</TabsTrigger>
    <TabsTrigger value="url">URL</TabsTrigger>
  </TabsList>
</Tabs>
```

```tsx
// SearchMode source filters container
<div className="sticky top-16 z-20 ...">...</div>
```

**Step 4: Run test to verify it passes**

Run: `npm run test:e2e -- --grep "add page exposes search and url tabs"`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/add/page.tsx src/components/ui/tabs.tsx tests/ui/routes-smoke.spec.ts
git commit -m "feat: use shadcn tabs and sticky filters on add page"
```

### Task 6: Improve Series Detail Actions and Sync Feedback

**Files:**
- Modify: `src/app/series/[slug]/page.tsx`
- Modify: `src/components/ChapterList.tsx`
- Test: `tests/ui/routes-smoke.spec.ts`

**Step 1: Write the failing test**

```ts
// tests/ui/routes-smoke.spec.ts
test("series page shows quick continue action", async ({ page }) => {
  await page.goto("/series/smoke-series");
  await expect(page.getByRole("link", { name: /weiterlesen/i })).toBeVisible();
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- --grep "series page shows quick continue action"`
Expected: FAIL because quick action is not guaranteed.

**Step 3: Write minimal implementation**

```tsx
// series/[slug]/page.tsx
// Add top-level CTA row with "Weiterlesen" and "Kapitel synchronisieren".
// Show explicit sync status text and progress metadata in header card.
```

**Step 4: Run test to verify it passes**

Run: `npm run test:e2e -- --grep "series page shows quick continue action"`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/series/[slug]/page.tsx src/components/ChapterList.tsx tests/ui/routes-smoke.spec.ts
git commit -m "feat: add series quick actions and clearer sync state"
```

### Task 7: Reader UX and Motion Polish

**Files:**
- Modify: `src/components/reader/Reader.tsx`
- Modify: `src/components/reader/ReaderSettingsDrawer.tsx`
- Modify: `src/components/reader/ChapterSlider.tsx`
- Modify: `src/lib/motion.ts`
- Test: `tests/ui/reader-smoke.spec.ts`

**Step 1: Write the failing test**

```ts
// tests/ui/reader-smoke.spec.ts
test("reader provides quick settings preset actions", async ({ page }) => {
  await page.goto("/read/smoke-series/1");
  await page.getByRole("button", { name: /einstellungen/i }).click();
  await expect(page.getByRole("button", { name: /cozy day/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /night read/i })).toBeVisible();
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- --grep "reader provides quick settings preset actions"`
Expected: FAIL because presets are missing.

**Step 3: Write minimal implementation**

```tsx
// ReaderSettingsDrawer.tsx
<button onClick={() => applyPreset("cozy-day")}>Cozy Day</button>
<button onClick={() => applyPreset("night-read")}>Night Read</button>
```

```ts
// Reader.tsx
// Keep bars contextual and animate with centralized motion transitions.
```

**Step 4: Run test to verify it passes**

Run: `npm run test:e2e -- --grep "reader provides quick settings preset actions"`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/reader/Reader.tsx src/components/reader/ReaderSettingsDrawer.tsx src/components/reader/ChapterSlider.tsx src/lib/motion.ts tests/ui/reader-smoke.spec.ts
git commit -m "feat: add reader presets and refined contextual controls"
```

### Task 8: Final Verification and Documentation

**Files:**
- Modify: `README.md` (theme/motion notes if needed)
- Optionally Modify: `docs/plans/2026-03-04-cozy-paper-night-reading-design.md`
- Test: `tests/ui/routes-smoke.spec.ts`, `tests/ui/reader-smoke.spec.ts`

**Step 1: Run full verification**

Run: `npm run lint`
Expected: PASS.

Run: `npm run test:e2e`
Expected: PASS.

**Step 2: Update docs minimally**

```md
- Added cozy-paper light theme and night-reading dark mode.
- Added centralized motion presets with reduced-motion support.
- Updated key user flows for discoverability and reading continuity.
```

**Step 3: Commit**

```bash
git add README.md docs/plans/2026-03-04-cozy-paper-night-reading-design.md
git commit -m "docs: document cozy paper and night reading UX system"
```
