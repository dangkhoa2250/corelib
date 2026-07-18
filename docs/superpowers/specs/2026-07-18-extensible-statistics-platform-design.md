# Extensible Statistics Platform Design

## Goal

Add a Statistics platform to Corelib that gives each user useful local insight into reading and Memora activity, supports drill-down into individual documents and decks, and gives administrators privacy-preserving aggregate product analytics from users who explicitly opt in.

The platform must be extensible: future Corelib apps should register statistics without adding fixed tabs or branching logic to the Statistics page. The first release prepares clean data for later AI analysis but does not generate AI scores, difficulty judgments, or learning advice.

## Product principles

1. Personal statistics are local-first and available without analytics consent.
2. Admin analytics are aggregate-only and use data from opted-in users only.
3. Active time is the common cross-app unit. App-specific units remain inside app detail views.
4. A statistic must have a documented definition. Do not create an opaque combined contribution score.
5. Reading coverage means pages visited, not comprehension or completion.
6. Real Memora study, consequence-free practice, and FSRS scheduling remain separate concepts.
7. Shared dashboard primitives must be reusable by Reading, Memora, Admin Analytics, and future apps.
8. All surfaces must work in light and dark mode using semantic tokens.
9. All scrollable desktop surfaces must use the Corelib `ScrollArea` strategy and reserve content inset for overlay thumbs.
10. The implementation starts collecting data when this feature ships. No historical backfill is required because the product is still in development.

## Scope

### Included

- A public `Statistics` destination in the application sidebar and Quick Open.
- A personal Statistics Overview.
- Personal Reading statistics.
- Per-document Reading and linked-Memora statistics.
- Personal Memora statistics.
- Per-deck Memora statistics.
- A reusable activity heatmap and line/area graph.
- User-selected heatmap color with automatically derived shades.
- Range filters for 7 days, 30 days, 1 year, and all time.
- Local active-time and reading-page instrumentation.
- Existing real-study review logs as the canonical Memora outcome source.
- Separate active-time accounting for Practice All.
- A typed app-statistics registry for future apps.
- Opt-in, aggregate Admin Analytics with minimum-cohort privacy protection.
- Loading, empty, partial-error, offline, accessibility, theme, command-registration, scroll-surface, and fresh-runtime verification.

### Excluded

- AI-generated analysis, recommendations, difficulty scores, or coaching.
- Per-user admin drill-down.
- Sending document, deck, card, search, prompt, or file content to the server.
- Import-source analytics.
- A permanent document `completed` flag.
- Invented or estimated reading history from before this feature.
- Cross-device synchronization of personal raw statistics.
- A user-configurable formula that mixes pages, reviews, and other app actions into one score.
- A general plugin runtime. The first registry is a typed in-repository registration mechanism.

## Definitions

### Active time

Active time counts time while a supported Corelib surface is visible and the user is actively engaged. Reader and Memora timers pause after 90 seconds without a qualifying interaction and resume on the next qualifying interaction.

Qualifying Reader interactions include page navigation, scrolling, zooming, text selection, annotation-related selection work, and explicit Reader controls. Window focus alone is not activity.

For Memora, the answer timer starts when a card becomes current, pauses after the same idle threshold, and stops when a rating is submitted or the session is left.

Raw local active time is preserved. Real-study Memora time comes from `review_logs.elapsed_ms`; when calculating dashboard totals, averages, or analytics summaries, one rating contributes at most 300,000 milliseconds. This cap protects aggregates from abandoned cards or timer faults without destroying the raw local observation. Reading and Practice All use their recorded session time and are not subject to the per-rating cap.

### Local active day

A local calendar day is active when it contains at least 60 seconds of active time in any app or at least one persisted real-study Memora rating.

`currentStreak` counts consecutive local active days ending today. If today is not yet active, it may end yesterday until the current local day finishes. This prevents a streak from disappearing in the morning before the user has had a chance to study.

### Reading session

A Reading session begins when the user opens a document and records the first qualifying activity. It ends when the user leaves the Reader, switches documents, closes the app, or remains idle for 30 minutes. Activity resuming before 30 minutes continues the same session with a new active segment; activity after 30 minutes creates a new session.

### Page visit, coverage, and revisit

- A page visit begins when a page becomes the primary visible page after another page was primary.
- In continuous scroll, the page with the largest visible area is primary.
- Re-rendering the same page does not create another visit.
- A unique page is a page with at least one recorded visit.
- `coverage = unique pages visited / document page count`.
- A revisit is a visit after that page has already been visited earlier.

Coverage is a navigation measure only. It must never be labeled completion, progress toward mastery, or comprehension.

### Memora recall and lapse

- A real review is a rating persisted through the real study command.
- `recallRate = (hard + good + easy) / total real reviews`.
- `lapseRate = reviews whose prior state was review and rating was again / reviews whose prior state was review`.
- Rating distribution contains Again, Hard, Good, and Easy counts and percentages.
- Practice All active time is included in personal activity totals but practice ratings are not included in recall, lapse, FSRS state, or due forecasts.

## Information architecture

### Public navigation

Add one public top-level destination:

- Title: `Statistics`
- Stable command ID: `route.statistics`
- Aliases: `analytics`, `activity`, `progress`, `insights`
- Breadcrumb: `Statistics`
- Quick Open surface only; this is a destination, not a Command Palette action.

`Statistics` must be added to `PUBLIC_ROUTE_CATALOG` in `apps/desktop/src/app/routes.ts`. The sidebar and Quick Open must resolve the same typed route. Do not add ad-hoc result handling in `App.tsx`.

App and item detail views are internal child states of the Statistics feature:

- `Statistics Overview`
- `Statistics / <app>`
- `Statistics / Reading / <document>`
- `Statistics / Memora / <deck>`

They are reached from the public Statistics destination or context links on a document/deck. They are not separate public catalog entries because they are filtered states owned by one public feature rather than independent application destinations. Their header must preserve a breadcrumb and Back behavior.

Admin Analytics is role-restricted and remains an internal child of Admin. It must not appear to non-admin users or in the public route catalog.

### Personal overview

The overview contains, in this order:

1. Page title and range picker.
2. Three KPI cards: Active time, Current streak, and Active days.
3. Reusable Activity chart card.
4. Searchable App insights grid.

The overview intentionally omits Sessions. Session meaning differs across Reading, Memora, Notes, AI Tutor, and future apps. Session counts belong in the relevant app detail.

### Drill-down

The navigation flow is:

`Statistics Overview -> App Statistics -> Item Statistics`

Library document actions and deck detail actions may link directly to the same canonical item-statistics view. Do not build duplicate embedded dashboards in Library or Memora.

## Approved metrics

### Personal overview

| Metric | Definition |
| --- | --- |
| Active time | Sum of capped active time for the selected range |
| Current streak | Consecutive local active days under the local-day rule |
| Active days | Count of local active days in the selected range |
| Activity series | Daily active time split by app |
| App allocation | Active time and primary app metric per registered app |

### Reading

| Level | Metrics |
| --- | --- |
| Reading app | Active time, session count, average active time per session, page visits, unique pages, revisits, daily/weekly trend |
| Document | Active time, session count, average session time, unique pages, lifetime coverage, revisits, frequently revisited pages, activity series |
| Document learning link | Cards sourced from the document, real reviews, recall rate, Again count, lapse count |

Lifetime document coverage remains visible even when a time range is selected. Time-range-sensitive metrics must be clearly separated from this lifetime value.

### Memora

| Level | Metrics |
| --- | --- |
| Memora app | Active study time, real review count, recall rate, rating distribution, capped mean answer time, card state distribution, lapse rate, active days, due forecast |
| Deck | The same metrics scoped to one deck |
| Document source | Real-review outcomes for cards whose source points to that document |

Due forecast buckets are Today, next 7 local days, and next 30 local days. Suspended, deleted, and practice-only cards are excluded.

### Admin overview

| Area | Metrics |
| --- | --- |
| Coverage | Approved users, analytics-enabled users, opt-in percentage, contributing-user count |
| Activity | DAU, WAU, MAU, average active days, average active time, app allocation, daily trend |
| Reading | Active users, average active time, average sessions, average page visits, returning-user rate |
| Memora | Active users, average active time, average real reviews, aggregate recall rate, aggregate rating distribution, weekly learning frequency |

Every admin chart must show its contributing-user count or make insufficient sample size explicit.

## Activity visualization

### Shared controls

The Activity chart card owns:

- App filter: `All apps` plus every registered statistics app.
- View selector: `Heatmap` or `Graph`.
- Range inherited from the page: 7 days, 30 days, 1 year, or all time.
- One saved color preference.

Changing the view must not reset the range, app filter, or selected color.

### Heatmap

- One cell represents one local calendar day.
- The heatmap always uses daily buckets.
- For All time, render one labeled calendar-year grid per year, newest first. Virtualize older year sections when more than three years exist; do not compress multiple dates into one cell.
- Cell intensity represents active time, never an opaque mixed score.
- Fixed non-zero bands are 1-14 minutes, 15-29 minutes, 30-59 minutes, 60-119 minutes, and 120 minutes or more.
- The neutral zero cell uses a theme surface token.
- Tooltip and keyboard focus reveal local date, total active time, and per-app breakdown.
- A screen-reader summary states active days, highest-activity day, and total active time for the visible range.

### Graph

- The graph is a responsive SVG line/area chart.
- Graph aggregation supports Daily, Weekly, and Cumulative.
- A one-year graph defaults to Weekly to avoid a dense 365-point line. The user may switch to Daily.
- All-app Overview shows total active time. App details may expose app-specific metric choices such as Reading pages or Memora reviews, but default to active time.
- Hover and keyboard focus reveal bucket label and exact value.
- The chart has an accessible tabular or textual summary; the SVG is not the only representation of the data.

### Color preference

The user chooses exactly one base color. A shared `deriveStatisticsPalette(baseColor, theme)` utility generates five ordered intensity shades for light and dark mode.

Requirements:

- Preserve hue while normalizing unsafe lightness/chroma.
- Generate shades in a perceptual color space such as OKLCH.
- Verify adjacent levels remain visually distinguishable.
- Verify tooltip, focus outline, and selected controls meet accessible contrast.
- Store only the base color in local preferences, under a versioned key.
- Do not send color preferences to analytics.

Provide a small preset palette and a custom color input. Presets and custom colors use the same derivation function.

## Reusable frontend architecture

Create focused shared components under `apps/desktop/src/features/statistics/components/`:

- `StatisticsShell`: header, breadcrumb, range picker, and scroll surface.
- `StatisticsRangePicker`: typed 7d/30d/1y/all selection.
- `KpiGrid` and `KpiCard`: label, formatted value, optional comparison/help text.
- `ActivityChartCard`: shared filters, view state, and color control.
- `ActivityHeatmap`: daily grid, legend, tooltip, focus navigation, summary.
- `ActivityGraph`: SVG line/area chart, bucket mode, tooltip, summary.
- `StatisticsColorPicker`: presets, custom input, and palette preview.
- `AppInsightGrid` and `AppInsightCard`: dynamic app summaries.
- `MetricSection`: consistent title, description, loading, empty, and error shell.
- `StatisticsSkeleton`, `StatisticsEmptyState`, and `StatisticsErrorState`.

Page components should compose these primitives:

- `StatisticsOverviewPage`
- `AppStatisticsPage`
- `DocumentStatisticsPage`
- `DeckStatisticsPage`
- `AdminAnalyticsPage`

Do not make one page component responsible for fetching, aggregation, chart layout, color math, routing, and formatting. Data loaders return typed view models; presentational components receive already-normalized values.

### Statistics app registry

Define a typed registry under `apps/desktop/src/features/statistics/registry.ts`:

```ts
interface StatisticsAppDefinition {
  key: string;
  title: string;
  icon: ComponentType;
  summaryMetrics: readonly string[];
  loadSummary(range: StatisticsRange): Promise<AppStatisticsSummary>;
  loadDetail(range: StatisticsRange): Promise<AppStatisticsDetail>;
}
```

Reading and Memora are the first definitions. `StatisticsOverviewPage` renders registry entries; it must not branch on app names. Server analytics retains a separate allowlist/schema for uploaded app summaries; adding an app requires both local registry registration and explicit server analytics schema registration.

## Theme and layout rules

- Use existing semantic tokens such as `--main-bg`, `--surface-1`, `--surface-2`, `--surface-3`, `--border-subtle`, `--border-strong`, `--text-primary`, `--text-secondary`, `--interactive-hover`, `--interactive-selected`, and `--focus-ring`.
- Do not copy the hard-coded colors from the existing Admin page into Statistics.
- Do not use a light token for a dark theme state or a dark literal for a light theme state.
- Chart gridlines, axes, empty cells, tooltip surfaces, borders, focus states, and skeletons must derive from semantic tokens.
- The only user-defined color is the chart accent. It must be normalized and never replace text, background, border, error, success, or focus semantic colors.
- App insight cards must remain readable without relying on accent color alone.
- Validate every component in light and dark mode, including hover, selected, focus, disabled, loading, empty, error, and tooltip states.
- Use a responsive grid. KPI cards collapse from three columns to one; App insight cards use a minimum card width rather than a fixed number of columns.
- Heatmap cell size may shrink within its readable minimum. When the 52-week grid cannot fit, use a horizontal `ScrollArea`; do not add `overflow-x: auto`.

## Scroll-surface requirements

The Statistics dashboard is a long desktop surface and must use `apps/desktop/src/components/ScrollArea.tsx`.

- `StatisticsShell` owns the vertical `ScrollArea`.
- Its immediate content element reserves at least 20px on the vertical-thumb side.
- A horizontally scrolling heatmap, when needed, uses a nested `ScrollArea` and reserves at least 20px below its content for the horizontal thumb.
- No new Statistics list, pane, or chart wrapper may use native `overflow: auto` without a documented WKWebView-safe reason.
- Add focused tests asserting both `ScrollArea` usage and required content insets.
- Fresh Tauri runtime verification must confirm there is no white native track and no thumb overlap in light and dark mode.

## Local persistence

Add a new desktop migration after `0010_memora_study.sql`.

### `activity_sessions`

```sql
CREATE TABLE activity_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  app_key TEXT NOT NULL,
  activity_kind TEXT NOT NULL,
  context_kind TEXT,
  context_id TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  local_day TEXT NOT NULL,
  timezone_offset_minutes INTEGER NOT NULL,
  raw_active_ms INTEGER NOT NULL CHECK (raw_active_ms >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Initial `app_key` values are `reading` and `memora`. Initial `activity_kind` values are `reading` and `practice`. Real study already has canonical session and per-rating persistence in `study_sessions`, `study_session_cards`, and `review_logs`; it must not be duplicated in `activity_sessions`. App and activity keys are validated in Rust instead of a closed SQL check so future apps can extend them without rebuilding the table.

Indexes:

- `(local_day, app_key)`
- `(context_kind, context_id, local_day)`
- `(started_at)`

### `reading_session_pages`

```sql
CREATE TABLE reading_session_pages (
  session_id TEXT NOT NULL REFERENCES activity_sessions(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page INTEGER NOT NULL CHECK (page > 0),
  raw_active_ms INTEGER NOT NULL CHECK (raw_active_ms >= 0),
  visit_count INTEGER NOT NULL CHECK (visit_count > 0),
  first_visited_at TEXT NOT NULL,
  last_visited_at TEXT NOT NULL,
  PRIMARY KEY (session_id, document_id, page)
);
```

Index `(document_id, page, last_visited_at)` supports document coverage and revisit queries.

Document deletion removes page-level rows. In the same deletion transaction, matching polymorphic `activity_sessions.context_id` values are set to null so aggregate Reading totals remain valid without leaving a drill-down target.

No migration backfill is required.

## Local recording services

### `ActivitySessionService`

Create a focused Rust module responsible for:

- Starting, checkpointing, pausing, resuming, and ending sessions.
- Validating app/activity/context values.
- Deriving local day and storing timezone offset supplied by the desktop client.
- Atomically updating session totals and page aggregates.
- Closing abandoned sessions safely during recovery.

The frontend checkpoints active segments at a bounded interval, for example every 15 seconds, and on page change, window blur, route exit, and application shutdown. A crash may lose only the uncheckpointed segment, not the entire session.

### Reader instrumentation

Create a small frontend hook, not instrumentation scattered across `ReaderPage`:

- `useReadingActivitySession(documentId, primaryPage)` owns visibility, idle state, checkpoints, and route cleanup.
- Page visibility measurement remains separate and reports only the primary page.
- Instrumentation failures never interrupt reading. They are logged as handled local errors and retried at the next checkpoint when safe.

### Memora instrumentation

- Replace wall-clock answer duration with an idle-aware active timer while preserving the `elapsed_ms` field sent to real study.
- Derive real-study active time from idle-aware `review_logs.elapsed_ms`, applying the five-minute cap only in aggregate queries.
- Derive real-study session counts from study sessions that consumed at least one card grant.
- Record one `activity_sessions` row for each Practice All session.
- Real-study outcome metrics continue to query `review_logs`; do not duplicate real-study time or rating outcomes in the activity table.
- Practice session activity is recorded, but practice ratings remain consequence-free and excluded from outcome metrics.

## Local query boundary

Add a focused Rust statistics repository/service. Do not place all statistics SQL into `learning.rs` or React.

Required commands:

- `get_statistics_overview(range)`
- `get_reading_statistics(range)`
- `get_document_statistics(document_id, range)`
- `get_memora_statistics(range)`
- `get_deck_statistics_detail(deck_id, range)`
- `start_activity_session(input)`
- `checkpoint_activity_session(input)`
- `finish_activity_session(input)`

The existing `get_deck_statistics` command remains available for current Memora list counts. The new detailed command must not silently change the semantics of the existing type.

All query responses use typed camelCase payloads defined in `apps/desktop/src/domain/statistics.ts` and wrappers in `apps/desktop/src/lib/statistics.ts`.

The backend computes local statistics. React must not load raw sessions or review logs and aggregate them in the UI.

## Admin analytics data flow

Personal raw statistics never leave SQLite. When analytics is enabled, the client produces one cumulative daily snapshot per app and local day containing only allowed numeric totals.

Example snapshot fields:

- `schemaVersion`
- `appKey`
- `localDay`
- `activeMs`
- `activeDay`
- `sessionCount`
- Reading: `pageVisitCount`, `uniquePageCount`
- Memora: `realReviewCount`, `againCount`, `hardCount`, `goodCount`, `easyCount`, `lapseCount`

Prohibited fields include document ID, deck ID, card ID, title, path, query, prompt, content, page number, tags, and free-form strings.

### Upload behavior

- Add a dedicated authenticated daily-statistics endpoint rather than overloading arbitrary analytics events.
- Use the authenticated account, local day, app key, and schema version as an idempotent upsert identity.
- Retrying replaces the same cumulative snapshot; it never adds the totals twice.
- Disabling analytics stops snapshot generation and clears unsent snapshots from the client queue.
- Previously accepted aggregate data is retained under the documented analytics policy; account deletion removes user-linked source rows.
- The server validates the app-specific payload schema and numeric bounds.

### Admin aggregation and privacy

- Admin endpoints return aggregate buckets only.
- Do not add an endpoint that lists a user's daily statistics.
- Every bucket has a distinct contributing-user count.
- Suppress metric values when fewer than five opted-in users contributed; return an `insufficientSample` state instead.
- DAU/WAU/MAU may use server-side pseudonymous account relationships for uniqueness, but those relationships are never returned to the Admin UI.
- Admin Analytics shows opt-in coverage so administrators do not mistake partial data for the whole population.

## Loading, empty, error, and offline states

- The page shell renders independently from data.
- Each metric section owns its loading, empty, and error state.
- A failed Reading section must not hide Memora or the Activity chart.
- `Retry` reloads only the failed section.
- No-data copy explains which activity creates the metric and links back to the relevant app.
- Document/deck not found returns to the parent statistics page with a clear message.
- Admin Analytics may show a cached last successful aggregate with an explicit updated timestamp. It must never imply cached data is live.
- Instrumentation errors must not block Reader or Review flows.

## Performance

- Checkpoint writes are batched and transactional.
- Statistics queries aggregate in SQLite and return chart-ready buckets.
- Add indexes before relying on full-year or all-time queries.
- The backend chooses sensible bucket defaults: daily for 7/30 days, weekly for one year, monthly for very long all-time graphs.
- Heatmap rendering is bounded to the requested calendar window. All-time year sections are virtualized after the newest three years.
- Avoid importing a large chart framework for two charts. Implement reusable CSS-grid heatmap and SVG graph primitives unless profiling proves a library is necessary.
- App summary requests may run in parallel, but the registry must limit or batch future app queries if the number of apps grows substantially.

## Accessibility

- All controls are keyboard reachable with visible token-based focus states.
- The segmented `Heatmap / Graph` selector exposes pressed/selected state.
- Heatmap cells support arrow-key navigation by day and week.
- Color is not the only carrier of information; tooltips and summaries contain exact values.
- Chart SVGs use labels and descriptions, with an accessible textual/tabular summary.
- Tooltips remain visible on keyboard focus and do not trap focus.
- Custom color input has a text label and palette preview.
- Respect reduced-motion preferences; do not animate hundreds of heatmap cells.

## Testing strategy

### Rust and SQLite

- Migration applies to a clean database and all supported prior migration states.
- Activity session lifecycle, validation, recovery, and transactional checkpoints.
- Local-day boundaries and timezone offsets.
- 90-second idle behavior as represented by submitted active segments.
- Five-minute Memora aggregate cap while raw time remains unchanged.
- Reading session and primary-page aggregation.
- Unique page, coverage, revisit, and document deletion behavior.
- Real-review recall and lapse definitions.
- Practice exclusion from outcome metrics and due forecasts.
- Document-source and deck-scoped review queries.
- Range and bucket boundaries for 7d, 30d, 1y, and all.

### React and domain utilities

- Registry-driven rendering without hard-coded Reading/Memora branches.
- KPI formatting and no-data behavior.
- Heatmap bands, keyboard navigation, tooltip data, and accessible summary.
- Graph Daily/Weekly/Cumulative switching.
- View, app, range, and color selection persistence.
- Palette generation in light and dark mode, including unsafe custom colors.
- Partial error and retry behavior.
- `StatisticsShell` uses `ScrollArea` and reserves at least 20px vertical inset.
- Narrow heatmap uses horizontal `ScrollArea` and reserves at least 20px bottom inset.
- Public route catalog, Quick Open aliases, breadcrumb, and coverage tests.

### PocketBase and analytics

- Opted-out clients do not enqueue or upload snapshots.
- Opt-in upsert is idempotent.
- Payload allowlist rejects identifiers and free-form data.
- Only admins can load aggregates.
- No API returns per-user statistics.
- Cohorts below five contributors are suppressed.
- Opt-in coverage, DAU/WAU/MAU, Reading, and Memora aggregates are correct.
- Account deletion removes user-linked source rows.

### Desktop UI verification

- Record `git rev-parse --short HEAD` and `git status --short`.
- Identify and restart any existing `tauri dev`, Vite, or desktop process.
- Launch a fresh `tauri dev` from the current checkout.
- Verify long Statistics pages and narrow heatmaps in light and dark mode.
- Confirm no white native scrollbar track and no overlay thumb covering content or controls.
- Verify hover, focus, selected, disabled, loading, empty, error, tooltip, color picker, and chart states.
- Verify Statistics is discoverable through sidebar and Quick Open.
- Do not claim release-app verification unless a fresh release artifact was built and launched from the documented bundle path.

## Delivery phases

The work is one product design but should be implemented in independently verifiable phases:

1. Shared domain types, migration, local activity session service, and deterministic repository tests.
2. Reader and Memora instrumentation with no dashboard dependency.
3. Shared Statistics UI primitives, route registration, Overview, Reading, document, Memora, and deck views.
4. Opt-in daily snapshots, PocketBase validation/upsert, aggregate admin APIs, and Admin Analytics UI.
5. Full regression, accessibility, theme, scroll-surface, performance, and fresh Tauri verification.

Each phase must keep existing Library, Reader, real study, Practice All, FSRS scheduling, account gating, and analytics opt-out behavior working.

## Acceptance criteria

- A user can open Statistics from the sidebar and Quick Open.
- Overview shows Active time, Current streak, Active days, Activity visualization, and registered apps.
- Heatmap and Graph share range, app, and color state.
- The chosen base color produces distinguishable light/dark palettes.
- Reading and Memora show the approved metrics.
- Document and deck drill-down reuse shared components and canonical queries.
- Reading activity pauses after idle, records primary pages, and produces correct coverage/revisit metrics.
- Real-study and Practice All metrics remain semantically separate.
- A future app can appear by adding a registry definition and provider rather than editing the Statistics page.
- Admin Analytics contains only opted-in aggregate data and suppresses cohorts under five users.
- No prohibited identifiers or content are uploaded.
- Public command registration tests pass.
- Statistics scroll surfaces use `ScrollArea`, reserve thumb insets, and show no white WKWebView track in a fresh light/dark Tauri run.
- Relevant frontend tests, Rust tests, PocketBase smoke tests, production build, and lint/clippy checks pass.
