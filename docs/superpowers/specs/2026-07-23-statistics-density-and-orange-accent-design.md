# Statistics Density and Orange Accent Design

**Date:** 2026-07-23

**Status:** Approved for implementation planning

**Selected direction:** A — Balanced refinement

## Context

The current Statistics dashboard is functionally complete, but its desktop
presentation is too large relative to the rest of Corelib. Large KPI shells,
section padding, radii, typography, and vertical spacing make the page feel
template-generated instead of intentionally designed for a desktop app.

The user selected the least aggressive refinement direction: reduce the
dashboard's visual scale by roughly 8–12% while preserving its current
structure, hierarchy, and breathing room.

Visual references:

- Current overview:
  `/var/folders/bt/j1f5fvln301gww7qwxzwhfwr0000gn/T/codex-clipboard-acf131fa-e052-48fd-a865-cc1f3e89102b.png`
- Current graph:
  `/var/folders/bt/j1f5fvln301gww7qwxzwhfwr0000gn/T/codex-clipboard-0367d4fb-27ad-4b47-95fe-5766eabcdff9.png`
- Approved density comparison:
  `.superpowers/brainstorm/52288-1784807805/content/statistics-density-directions.html`

## Goals

1. Make Statistics feel like a considered Corelib desktop surface rather than
   an oversized web dashboard.
2. Preserve the existing information hierarchy and all Statistics behavior.
3. Remove chart-color customization and use the app's semantic orange accent.
4. Prevent graph-axis labels from colliding in long Year/Weekly views.
5. Preserve WKWebView scroll safety, light/dark token correctness, and current
   responsive behavior.

## Non-goals

- No change to statistics data, aggregation, persistence, APIs, routes, or
  navigation.
- No new dashboard layout, card order, chart type, or interaction.
- No change to the heatmap's Year cell height or one-pixel Year column gap.
- No global redesign of Corelib tokens or unrelated screens.
- No runtime launch of Library.app, Tauri, or Vite. Verification remains CLI
  only until the user explicitly permits a fresh app launch.

## Desktop density specification

The following targets apply at widths above `900px`.

| Area | Current | Approved target |
| --- | ---: | ---: |
| Content padding | `32px 20px 44px 32px` | `28px 20px 38px 28px` |
| Header gap | `24px` | `20px` |
| Header bottom margin | `30px` | `24px` |
| Page title | `clamp(30px, 3vw, 40px)` | `clamp(28px, 2.7vw, 36px)` |
| KPI grid gap | `18px` | `16px` |
| KPI minimum height | `174px` | `156px` |
| KPI padding | `20px` | `18px` |
| KPI radius | `16px` | `14px` |
| KPI icon tile | `42px` | `38px` |
| KPI icon | `21px` | `19px` |
| KPI label | `14px` | `13px` |
| KPI value | max `34px` | max `32px` |
| KPI sparkline | max `124×42px` | max `108×36px` |
| Section padding | `26px` | `22px` |
| Section radius | `18px` | `16px` |
| Section spacing | `22px` | `18px` |
| Section title | `21px` | `20px` |
| Section-header bottom margin | `20px` | `16px` |
| Standard control height | `36px` | `34px` |
| Standard control text | `14px` | `13px` |
| Chart-filter bottom margin | `20px` | `16px` |
| App-grid gap | `18px` | `16px` |
| App-card padding | `22px` | `20px` |
| App-card radius | `15px` | `14px` |
| App-card gap | `22px 18px` | `18px 16px` |
| App icon tile | `44px` | `40px` |
| App title | `20px` | `18px` |
| App metric | `27px` | `25px` |
| App sparkline | `102×42px` | `92×36px` |

The page content max width remains `1180px`. The dashboard becomes
quieter through component scale and spacing, not by making the main column
artificially narrow.

## Heatmap spacing

The heatmap already has appropriate data density, especially in Year mode.
Keep these values unchanged:

- Year row height: `17px`
- Year column gap: `1px`
- Year cell radius: `2px`

Only its surrounding whitespace becomes slightly tighter:

- X-axis bottom margin: `8px` → `6px`
- Tooltip top margin: `12px` → `10px`
- Summary top margin: `12px` → `10px`

The heatmap must remain width-constrained inside its card without horizontal
scrolling.

## Fixed semantic orange accent

Statistics no longer exposes chart-color customization.

1. Remove `StatisticsColorPicker` from `ActivityChartCard`.
2. Remove the entire `Chart color` rail and its CSS.
3. Delete the color-picker component and its dedicated tests.
4. Reduce `StatisticsPreferences` to the persisted chart view only.
5. Ignore any legacy `baseColor` field already stored in the version-one
   preference payload.
6. Use `var(--warning)` as the single semantic orange source:
   - light theme currently resolves to `#b85c00`;
   - dark theme currently resolves to `#ff9f0a`.
7. Derive the five heatmap tones from `var(--warning)` and the active surface
   token using the existing `color-mix(in oklch, ...)` approach.
8. Set `--statistics-accent: var(--warning)` so KPI and app-card sparklines use
   the same orange family.
9. Graph line, points, and area fill use the same derived orange palette.

No raw orange value may be duplicated across Statistics CSS and
components. The semantic token is the source of truth for both themes.

## Graph-axis label collision

The current Year/Weekly graph can produce eight long labels, including two
labels near the right edge, causing overlap.

The visible X-axis must:

- render at most six labels in Weekly mode;
- render at most seven labels in Daily or Cumulative mode;
- sample labels at evenly distributed indices including the first and last
  point;
- show the compact date only, such as `Dec 29`, without the visible
  `Week of` prefix;
- retain the full week meaning in the chart's accessible label and tooltip.

The implementation must expose the sampling logic as a pure helper so unit
tests can verify dense Year data without depending on SVG measurements in
JSDOM.

## Graph point treatment

The graph must not render a persistent circle for every data point. At rest,
the chart contains only:

- horizontal grid lines and axis labels;
- the orange trend line;
- the low-opacity orange area fill.

Pointer interaction renders exactly one marker at the data point nearest the
pointer's X position. The marker disappears when the pointer leaves the chart.

Keyboard interaction retains equivalent access:

- tabbing into the SVG activates the current keyboard index;
- Left, Right, Home, and End move that index;
- while the chart has keyboard focus, exactly one marker and its tooltip are
  visible;
- the marker disappears when keyboard focus leaves the chart.

The active marker radius is `3` SVG units. The current inactive radius of `3`
and active radius of `5` are removed along with the per-point circle list.
There must be no oversized first-point marker on initial render.

The line path remains the authoritative visual representation. Marker
interaction state must not rebuild or alter the line or area paths.

## Responsive behavior

At `721–900px`:

- KPI cards use `18px` padding, `14px` radius, and `146px`
  minimum height.
- Sections use `20px` padding.
- The existing two-column-to-one-column breakpoints remain unchanged.

At `720px` and below:

- Keep standard controls at least `36px` high for touch comfort.
- Keep section padding at `18px`.
- Keep KPI cards at least `148px` high.
- Do not inherit the tighter desktop control height.

The immediate content inside `ScrollArea` must retain exactly `20px` right
padding. This is the required safe gutter for the 8px custom thumb plus its
outer margin.

## Component and file boundaries

Primary implementation files:

- `apps/desktop/src/features/statistics/statistics.css`
- `apps/desktop/src/features/statistics/components/ActivityChartCard.tsx`
- `apps/desktop/src/features/statistics/components/ActivityGraph.tsx`
- `apps/desktop/src/features/statistics/preferences.ts`

Expected test updates:

- `apps/desktop/src/styles/tokens.test.ts`
- `apps/desktop/src/features/statistics/components/ActivityChartCard.test.tsx`
- `apps/desktop/src/features/statistics/components/ActivityGraph.test.tsx`
- `apps/desktop/src/features/statistics/preferences.test.ts`

Files expected to be removed:

- `apps/desktop/src/features/statistics/components/StatisticsColorPicker.tsx`
- `apps/desktop/src/features/statistics/components/StatisticsColorPicker.test.tsx`

Do not create a second dashboard stylesheet or a parallel compact component
tree. The approved direction is a refinement of the existing reusable
Statistics primitives.

## Testing and verification

Implementation follows test-driven development:

1. Add failing tests proving the color picker is absent and saved legacy colors
   no longer influence rendering.
2. Add failing pure-helper tests for evenly sampled Weekly labels and compact
   visible text.
3. Add failing graph tests proving no markers exist at rest, one radius-three
   marker appears for pointer interaction, and one marker remains available
   during keyboard navigation.
4. Update focused CSS regression assertions with the approved density targets,
   including the unchanged 20px scrollbar gutter.
5. Implement the smallest production changes needed to pass.
6. Run focused Statistics, shared token, and ScrollArea tests.
7. Run the complete frontend test suite and production frontend build.
8. Run `git diff --check` and a forbidden-pattern scan for gradients, native
   selectors, horizontal scroll, and `max-content`.

Because the user forbids launching the application, passing tests and build do
not prove the final WKWebView appearance. `design-qa.md` must remain
`final result: blocked` and explicitly state that no fresh runtime visual
comparison occurred.

## Acceptance criteria

- The approved A-density values are used at desktop widths.
- The dashboard still uses existing semantic surface, border, text, focus, and
  shadow tokens in both themes.
- No `Chart color` label, preset swatch, or custom color input remains.
- Heatmap, graph, points, fills, and sparklines use semantic orange.
- Weekly Year graph labels do not collide by construction.
- Graphs render no persistent point markers at rest.
- Pointer or keyboard interaction renders exactly one radius-three marker.
- Year heatmap cell density remains unchanged.
- No horizontal scrollbar is introduced.
- The Statistics `ScrollArea` content keeps its 20px right inset.
- Focused and full frontend tests pass.
- Production frontend build passes.
- No Library/Tauri/Vite application process is started.
