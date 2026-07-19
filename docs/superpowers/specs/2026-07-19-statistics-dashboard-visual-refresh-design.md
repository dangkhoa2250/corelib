# Statistics Dashboard Visual Refresh Design

## Goal

Refresh the personal Statistics experience so it has the hierarchy and information density of the approved dashboard reference while remaining visually native to Corelib. Replace the current date-only contribution grid with an honest day-by-time heatmap, replace native Statistics dropdowns with the shared app control, and keep the whole experience token-correct in light and dark mode.

This change prepares trustworthy local data for future AI learning advice. It does not add AI analysis or upload hourly habits to Admin Analytics.

## Approved visual direction

### Page hierarchy

The personal Statistics overview renders in this order:

1. Header row with `Statistics` on the left and calendar-period controls on the right.
2. Three wide KPI cards: Active time, Current streak, and Active days.
3. One large Activity card containing the app filter, Heatmap/Graph toggle, visualization, legend, and textual summary.
4. One App insights card containing responsive Reading, Memora, and future registered-app summary cards.

The reference image supplies layout hierarchy, density, and component proportions. Corelib's own typography, icon set, surfaces, borders, radii, shadows, and interaction tokens remain authoritative. Do not copy its neon blue, gradients, glow effects, or hard-coded dark colors.

### Period controls

The personal dashboard replaces `7 days / 30 days / 1 year / All time` with:

- `Week`
- `Month`
- `Year`

These are calendar periods, not rolling windows:

- Week is Monday through Sunday containing the selected anchor date.
- Month is the selected calendar month.
- Year is the selected calendar year.

The selector is accompanied by two icon-only buttons:

- Previous moves to the preceding week, month, or year.
- Next moves to the following period but is disabled when the selected period is the current local period.
- After navigating backward, Next remains enabled until the current period is reached.
- Changing Week/Month/Year resets the anchor to the current period for that unit.

The visible label states the selected period, for example `Jul 14–20, 2026`, `July 2026`, or `2026`. Buttons use existing chevron icons, `aria-label`, disabled state, focus ring, and tooltip; they contain no visible words.

Month is the default view. The last selected period unit may be stored locally, but the historical anchor is not persisted across launches.

## KPI cards

Each KPI card contains:

- a semantic icon inside a `--surface-3` tile;
- a secondary label;
- a prominent value;
- a compact sparkline when the metric has a meaningful series;
- an optional comparison with the immediately preceding equivalent calendar period.

Active time and Active days may show a previous-period percentage. Zero-to-zero displays `No change`; a zero previous value with a positive current value displays `New activity` rather than an infinite percentage. Current streak is a lifetime value ending today or yesterday and does not show a misleading period comparison.

Comparisons use semantic success/secondary colors, never the user-selected chart accent. The UI must not render invented comparison values while data is loading or unavailable.

## Activity card

The Activity card owns:

- an app filter with `All apps` and every registered statistics app;
- a two-option `Heatmap / Graph` segmented control;
- the current calendar period inherited from the page;
- one saved chart base color whose shades are derived for the active theme;
- a visible summary and accessible exact values.

Changing app, view, or color must not change the selected period. Changing period must not reset app, view, or color.

### Dropdown behavior

Statistics must not use a native `<select>`.

Extend the shared `Combobox` component with a non-searchable mode and use it for the Activity app filter and Admin Analytics app filter. In non-searchable mode:

- the trigger uses a flat `--surface-1` or `--surface-2` background, semantic border, and existing chevron icon;
- hover uses `--interactive-hover`;
- open/selected uses the existing semantic interaction state;
- the popup uses the existing panel surface, border, shadow, selected checkmark, keyboard navigation, and outside-click behavior;
- no gradient, glow, chart accent, or native browser arrow is allowed.

The shared component remains searchable by default so existing card and settings flows do not change.

## Day-by-time heatmap

### Axes and meaning

The vertical axis has six four-hour buckets:

- 00:00–04:00
- 04:00–08:00
- 08:00–12:00
- 12:00–16:00
- 16:00–20:00
- 20:00–24:00

Labels show boundary values `0h, 4h, 8h, 12h, 16h, 20h, 24h`; 24h is the lower boundary, not a seventh data row.

The horizontal axis adapts to the selected period:

- Week: seven date columns.
- Month: 28–31 date columns.
- Year: 52 or 53 ISO-week columns.

In Year view, one cell is the total active time recorded in the same four-hour local-time bucket across all days of that ISO week. The tooltip names the week range, time bucket, and duration. Week and Month cells retain exact local dates.

Cell intensity always represents active milliseconds. It never combines pages, reviews, cards, or sessions into an opaque score. Zero activity uses a semantic neutral surface. Five non-zero intensity levels come from the user's one saved base color.

### Fit and scrollbar rule

The heatmap always fits inside the Activity card:

- no horizontal `ScrollArea`;
- no `overflow-x: auto`;
- no native horizontal scrollbar;
- grid columns use `minmax(0, 1fr)` and reduce gap/radius by density;
- Week cells are large, Month cells are medium, and Year cells are compact vertical marks;
- date labels are sampled at readable intervals instead of labeling every narrow column.

At narrow desktop widths, supporting summary content moves below the plot before the plot is allowed to become unreadable. If the available chart width drops below the supported desktop minimum, labels reduce before data columns are removed. The outer Statistics page continues to use the existing vertical `ScrollArea` with at least 20px thumb-side content inset.

### Interaction and accessibility

- Hover and keyboard focus reveal exact period/date, time bucket, total duration, and app breakdown when available.
- Arrow Left/Right moves across dates or weeks; Arrow Up/Down moves across time buckets.
- Each cell has an accessible label independent of color.
- Future dates inside the current week, month, or year are marked unavailable and excluded from summaries and intensity thresholds.
- The visible summary states total active time, active days, strongest time bucket, and highest-activity date/week.
- A screen-reader summary exposes the same information without relying on the grid.

## Graph behavior

Graph remains an alternative view and uses the same selected calendar period and app filter.

- Week defaults to daily points.
- Month defaults to daily points.
- Year defaults to weekly points.
- Daily, Weekly, and Cumulative modes remain available only when meaningful for the selected period.
- The graph and heatmap use the same base color and semantic tooltip surface.

## App insights

App insights use large responsive cards rather than small generic tiles. Each registered app supplies:

- icon and title;
- short static product tagline;
- active time;
- one app-specific primary metric, such as Reading sessions or Memora reviews;
- optional mini trend using real bucket data;
- a trailing icon-only navigation button when detail navigation is available.

The registry remains the source of app definitions. The overview must not branch on `reading` or `memora` inside the layout component, so later apps automatically receive the shared card structure.

## Data model

Daily buckets are insufficient for the approved heatmap. Add local-only four-hour aggregation without uploading it to PocketBase.

### Activity sessions

Persist checkpoint increments into `activity_session_time_buckets`:

```sql
CREATE TABLE activity_session_time_buckets (
  session_id TEXT NOT NULL REFERENCES activity_sessions(id) ON DELETE CASCADE,
  local_day TEXT NOT NULL,
  bucket_start_hour INTEGER NOT NULL,
  raw_active_ms INTEGER NOT NULL CHECK (raw_active_ms >= 0),
  PRIMARY KEY (session_id, local_day, bucket_start_hour),
  CHECK (bucket_start_hour IN (0, 4, 8, 12, 16, 20))
);
```

At each Reading or Practice checkpoint, split the active increment across any crossed four-hour boundary using the session's persisted timezone offset. Upsert one or more bucket rows in the same transaction as the session total.

### Real Memora reviews

Add `local_minute_of_day` to `review_logs`. The real-study command records the current local minute when the rating is persisted. Assign capped review elapsed time to the corresponding four-hour bucket for statistics aggregation. Practice activity continues to come from generic activity sessions, so practice ratings remain excluded from learning outcomes.

No historical backfill is required because the product is still in development.

### Query contract

Introduce a personal calendar-period query:

```ts
type StatisticsPeriodUnit = "week" | "month" | "year";

interface StatisticsPeriod {
  unit: StatisticsPeriodUnit;
  anchorLocalDay: string;
}

interface StatisticsTimeBucket {
  localDay: string;
  bucketStartHour: 0 | 4 | 8 | 12 | 16 | 20;
  activeMs: number;
  appKey: string;
}
```

Rust validates the anchor date, derives calendar boundaries, returns zero-filled heatmap buckets, and returns previous-period KPI aggregates. Existing Admin Analytics upload remains daily and privacy-preserving; it does not receive local time-of-day buckets.

## Theme rules

- Page background: `--main-bg`.
- Primary cards: `--surface-1`; nested app cards may use `--surface-2`.
- Icon tiles and empty heatmap cells: `--surface-3`.
- Borders, shadows, text, interaction, focus, success, and disabled states use semantic tokens.
- Do not add gradients to cards, dropdowns, segmented controls, icon tiles, or chart backgrounds.
- Do not use the chart accent for text, comparison status, borders, focus rings, or app navigation.
- Light and dark mode use the same component rules; theme selectors are permitted only where palette derivation needs the active theme.

## States and responsive behavior

Loading renders card-shaped skeletons that preserve page geometry. Errors stay inside the affected section and do not collapse the rest of the dashboard. Empty activity renders zero KPIs plus a helpful Activity empty state with the empty grid still providing period context.

The KPI grid collapses from three columns to one. App cards collapse from two columns to one. Header controls wrap without clipping. The period label remains visible, and icon navigation retains at least a 32px target.

## Verification boundaries

Required automated verification:

- Rust migration, checkpoint splitting, calendar boundary, previous-period, and zero-fill tests.
- TypeScript bridge contract tests.
- Heatmap density, keyboard navigation, labels, future-date handling, and no-horizontal-scroll tests.
- Shared Combobox non-searchable-mode tests with existing searchable-mode regression coverage.
- Light/dark token source assertions and no-gradient assertions for Statistics.
- Existing command registry coverage.
- Full frontend tests and production build.
- Rust tests and Clippy with warnings denied.

The user explicitly requested that Codex not run or open Library/Tauri. Therefore this work must not launch `tauri dev`, Vite, or a release app. Final handoff must state that fresh WKWebView visual verification was not performed and must not infer runtime behavior from any already-open application.

