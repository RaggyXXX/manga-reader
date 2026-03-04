# Cozy Neutral Frontend Redesign Design (Full UI Overhaul)

Date: 2026-03-04
Project: manga-reader
Scope: UI/UX redesign only (no API, logic, or behavior changes)

## 1. Goals

- Deliver a significantly improved, cohesive frontend across all main pages.
- Standardize the UI using component libraries and a single theme system.
- Ensure full responsive behavior with mobile-first design as the default.
- Introduce subtle, high-quality animations that improve UX without distraction.

## 2. Non-Goals / Constraints

- No changes to business logic, scraping flow, API endpoints, data models, or existing functional behavior.
- No backend contract changes.
- No feature scope expansion beyond UI/UX presentation and interaction polish.

## 3. Technology Direction

- Styling/UI: Tailwind CSS + shadcn/ui
- Motion: Framer Motion
- Existing CSS Modules: fully replaced (no long-term mixed styling model)

## 4. Visual System: Cozy Neutral Theme

- A warm-neutral palette with strong readability and low visual fatigue.
- Consistent tokens for:
  - Colors (surface, text, borders, accents, states)
  - Typography scale
  - Spacing scale
  - Border radii
  - Shadows
  - Motion (duration, easing, distance)
- A unified look across cards, modals, drawers, navigation, forms, and reader controls.

## 5. Information Architecture & UX Coverage

All main pages are included:

- Home
  - Clear visual hierarchy
  - Better sectioning for discovery and continue-reading content
- Add/Search
  - Prominent search input
  - Responsive filter/sort UI
  - Better loading/empty/error states
- Series Detail
  - Clear top-level content hierarchy (cover/meta/actions)
  - Improved chapter list readability
- Reader
  - Content-first composition with minimized chrome
  - Unified settings drawer and navigational controls
- Stats
  - Clear dashboard card hierarchy and readability
- Global components
  - Navigation, modal, drawer, toast, skeleton, badges, and shared feedback patterns

## 6. Responsive Strategy

- Mobile-first layouts and spacing by default.
- Progressive enhancement to tablet/desktop.
- Touch targets and interaction density tuned first for mobile ergonomics.
- Consistent breakpoints and grid behavior across all screens.

## 7. Motion Strategy

- Framer Motion used for:
  - Page and section entry transitions
  - Modal/drawer enter-exit transitions
  - Card/list stagger reveals
  - Hover/press state feedback
- Motion principles:
  - Subtle and purposeful, not decorative noise
  - Fast, smooth transitions with consistent easing
  - Full support for prefers-reduced-motion

## 8. Risk Management / Guardrails

- Strict separation between view-layer refactor and logic layer.
- Preserve component behavior and data flow while replacing markup/styling composition.
- Validate each page via visual and interaction regression checks.
- Keep migration deterministic by using reusable UI primitives and tokens.

## 9. Acceptance Criteria

- Every main page is migrated to Tailwind + shadcn/ui styling patterns.
- Legacy CSS module styling is removed from the migrated pages/components.
- Theme is visually coherent and consistent across all surfaces.
- Responsive behavior works cleanly on mobile and desktop.
- Animations are present, subtle, and respect reduced-motion preferences.
- User-visible functionality remains unchanged.

## 10. Next Step

Create a detailed implementation plan (work breakdown, sequencing, checkpoints, verification) using the writing-plans process.
