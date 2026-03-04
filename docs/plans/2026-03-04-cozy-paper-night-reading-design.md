# Cozy Paper + Night Reading Redesign Design

Date: 2026-03-04
Status: Approved
Scope: Visual direction, UX hierarchy, motion language, and implementation boundaries for the existing Next.js + shadcn + Framer Motion frontend.

## 1. Goals
- Move away from flat/white, generic UI to a recognizable "cozy paper" identity.
- Add a complementary dark "night reading" mode for low-glare sessions.
- Improve usability and information hierarchy across Library, Add, Series, and Reader.
- Keep motion subtle, meaningful, and respectful of reduced-motion preferences.

## 2. Non-Goals
- No backend/API changes.
- No rewrite of reader rendering architecture.
- No heavy decorative animation that distracts from reading.

## 3. Product Direction
Recommended approach: Cozy-paper art direction (primary) plus reader-first UX refinements.

Rationale:
- Delivers the strongest perceived quality jump.
- Preserves current architecture and existing shadcn/framer foundations.
- Improves daily usability without introducing risky behavior changes.

## 4. Visual System
### 4.1 Light Theme: Cozy Paper
- Base surfaces use warm paper tones (no pure white backgrounds).
- Components get layered depth via subtle borders/shadows instead of strong contrast.
- Accent palette remains warm and restrained.
- Editorial feel: serif-forward headings + clean sans-serif UI text.

### 4.2 Dark Theme: Night Reading
- Deep charcoal base (not pure black), warm accent mapping.
- Reduced contrast spikes and less eye strain in long sessions.
- Reader-specific dark appearance remains calm and legible.

### 4.3 Token Strategy
Define/refresh tokens for both modes:
- Core: background, foreground, card, muted, border, input, primary, accent, ring.
- Surface depth: surface-1/2/3 for hierarchical layering.
- Atmosphere: ambient glow and paper-grain intensity.

All pages must consume tokens only (no hardcoded one-off colors unless intentionally scoped).

## 5. UX Structure by Screen
### 5.1 Library
- Compact hero with clear primary action.
- Continue Reading elevated above the series grid.
- Stronger card hierarchy: title, progress, and contextual metadata.
- Optional compact/list density mode for power users.

### 5.2 Add
- Replace custom search/url toggle with shadcn Tabs.
- Sticky filter row on mobile for source switching while scrolling.
- Clarify result actions and empty/no-result guidance.

### 5.3 Series Detail
- Unified header card with cover, progress stats, and quick actions.
- Better chapter action visibility (continue, sync, mark/read flow).
- Sync state shown as explicit progress feedback, not only a badge.

### 5.4 Reader
- Reduce persistent chrome; expose controls contextually.
- Add quick resume affordances (last position / next unread).
- Bottom-sheet settings presets for common reading contexts.

## 6. Motion System
### 6.1 Principles
- Subtle and calm by default.
- Purpose-driven (orientation, hierarchy, feedback), never decorative noise.
- Global reduced-motion fallback must zero-out non-essential animation.

### 6.2 Timing & Easing
- Fast: 140ms
- Base: 220ms
- Slow: 320ms
- Easing: cubic-bezier(0.22, 0.8, 0.2, 1)

### 6.3 Patterns
- Page transitions: fade + small Y translation (8-12px).
- Lists: initial stagger on first render only.
- Cards: micro-elevation + tiny scale on hover (1.01-1.02).
- Navigation: animated active indicator via shared layout.
- Reader bars/panels: opacity + blur + slight offset transitions.

## 7. Accessibility & Performance
- Respect `prefers-reduced-motion` everywhere.
- Preserve WCAG contrast targets in both themes.
- Avoid heavy paint effects in reader viewport.
- Keep animations GPU-friendly (transform/opacity first).

## 8. Rollout Order
1. Theme tokens and dark mode foundation.
2. App shell/nav atmosphere and theme toggle.
3. Library and card hierarchy refinements.
4. Add page tabbed/search UX improvements.
5. Series detail action and sync feedback improvements.
6. Reader interaction and settings polish.

## 9. Success Criteria
- Interface no longer appears flat/white/generic.
- Theme switch creates coherent identity in both light and dark.
- Primary user paths require fewer decisions and less visual scanning.
- Motion feels polished but unobtrusive.

## 10. Risks & Mitigations
- Risk: over-styled UI reduces clarity.
  - Mitigation: tokenized hierarchy and restrained accent usage.
- Risk: dark mode inconsistency between reader and app shell.
  - Mitigation: shared semantic tokens and dedicated reader presets.
- Risk: animation regressions/perf drops on mobile.
  - Mitigation: central motion presets + reduced-motion hard fallback.
