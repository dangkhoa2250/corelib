# Statistics Blue Accent Design

**Date:** 2026-07-24

**Status:** Approved for implementation planning

**Selected direction:** Dedicated Statistics blue token with theme-aware contrast

## Context

The Statistics dashboard previously used the app's semantic warning orange.
The user has replaced that decision with the slate-blue family shown in:

`/var/folders/bt/j1f5fvln301gww7qwxzwhfwr0000gn/T/codex-clipboard-bf46a518-1ebd-40fd-88c3-f4862a4bb51f.png`

Sampled reference colors include `#303e4b`, `#456079`, `#618cb5`, and
`#83c3ff`. This specification supersedes only the orange-accent requirements
in `2026-07-23-statistics-density-and-orange-accent-design.md`. Its density,
interaction, accessibility, responsive, scrollbar, and graph-label
requirements remain unchanged.

## Goals

1. Use one recognizable blue family across every Statistics visualization.
2. Match the reference's quiet slate-blue low levels and clear light-blue
   highest level.
3. Preserve readable contrast in both light and dark themes.
4. Keep the accent scoped to Statistics so unrelated Corelib surfaces do not
   change.

## Visual system

Statistics owns a dedicated `--statistics-accent` token:

- Dark theme strongest tone: `#83c3ff`, sampled from the reference.
- Light theme strongest tone: `#456079`, the darker reference tone that
  remains legible against light surfaces.

The five heatmap levels are derived from the active
`--statistics-accent` and `--surface-1` using `color-mix(in srgb, ...)`.
Use `[18, 36, 55, 76, 100]` in light mode and
`[28, 45, 62, 79, 100]` in dark mode. The theme-aware lower levels keep low
activity quiet, while the 100% final level guarantees that Graph lines,
markers, sparklines, and the highest Heatmap level use the exact accent.

The strongest active tone applies to:

- Activity Graph line;
- Activity Graph hover and keyboard marker;
- KPI-card mini sparklines;
- App-insight mini sparklines.

The middle palette tone remains the Activity Graph area fill source at its
existing opacity. Empty heatmap cells remain neutral `--surface-3`.

## Scope and boundaries

Primary implementation files:

- `apps/desktop/src/features/statistics/statistics.css`
- `apps/desktop/src/features/statistics/preferences.ts`

Expected test updates:

- `apps/desktop/src/features/statistics/preferences.test.ts`
- `apps/desktop/src/styles/tokens.test.ts`
- Statistics component tests only if their token contract changes.

No color picker returns. No new persisted color setting is introduced. The
Graph and Heatmap continue receiving one shared derived palette, while mini
sparklines continue consuming `--statistics-accent`.

## Non-goals

- No layout, sizing, graph geometry, heatmap density, or interaction changes.
- No changes to data collection, aggregation, APIs, routes, or persistence.
- No modification of global `--link`, `--warning`, or other semantic colors.
- No gradients and no horizontal scrolling.
- No Library/Tauri/Vite runtime launch.

## Testing and verification

1. Add failing token and palette tests that require the dedicated blue accent
   in both themes.
2. Require all derived Heatmap and Graph colors to originate from
   `--statistics-accent`, not `--warning`.
3. Require mini sparklines to continue using `--statistics-accent`.
4. Run focused Statistics and token tests.
5. Run the full frontend test suite, production frontend build, and
   `git diff --check`.
6. Do not launch the application. Record runtime visual verification as
   blocked until the user permits a fresh WKWebView launch.

## Acceptance criteria

- Heatmap, Activity Graph, marker, area fill, KPI sparklines, and App-insight
  sparklines use the same blue family.
- Dark mode's strongest visualization tone is `#83c3ff`.
- Light mode's strongest visualization tone is `#456079`.
- Low heatmap levels are subdued while the highest level is unmistakably blue.
- No Statistics visualization still depends on `--warning`.
- Existing light/dark surface, border, text, focus, scrollbar, and responsive
  behavior remains unchanged.
- Focused tests, the full frontend suite, and the production frontend build
  pass without launching Library/Tauri/Vite.
