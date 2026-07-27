# Statistics App Master-Detail Redesign

**Date:** 2026-07-24

**Status:** Approved for implementation planning

**Selected direction:** Master-detail explorer for Reading documents and Memora decks

## Context

The Statistics overview is already acceptable and remains unchanged. The
problem begins after opening an individual app:

1. Reading and Memora app pages are difficult to scan.
2. Generic KPI cards repeat the same chart icon for unrelated metrics.
3. Session metrics occupy far more space than their importance warrants.
4. App pages only expose a graph because their detail payloads do not include
   time-of-day buckets.
5. Document and deck detail queries already exist, but users can only discover
   them from Library or Memora context menus. The Statistics app page has no
   document or deck navigation.

The current implementation routes both built-in apps through
`RegisteredAppStatisticsPage`, which flattens every metric into an identical
KPI card. Dedicated Reading, Document, Memora, and Deck pages exist but are not
composed into a discoverable workspace.

## Visual references

- Current Reading app page:
  `/var/folders/bt/j1f5fvln301gww7qwxzwhfwr0000gn/T/codex-clipboard-93d797d2-b97c-42ab-9848-2ac2a373d0be.png`
- Selected master-detail concept:
  `/Users/jason/.codex/generated_images/019f9466-b312-71a2-8fd0-950715c321d6/exec-f68bca21-4eac-482d-bdf8-bb9b3c95aefa.png`

The generated concept communicates structure and hierarchy. This specification
is authoritative where the concept invents unavailable metadata, dimensions,
or styling.

## Goals

1. Keep the current Statistics overview behavior and visual hierarchy.
2. Make Reading and Memora app statistics compact, clear, and visually quiet.
3. Let users switch between app totals and individual documents or decks
   without leaving Statistics.
4. Render the full selected document or deck detail in the right panel.
5. Make Heatmap available for Reading, Memora, each document, and each deck.
6. Preserve existing calendar-period behavior, graph modes, blue visualization
   palette, accessibility, and registry extensibility.
7. Use Corelib's `ScrollArea` correctly so long entity lists do not expose a
   white native WKWebView track or place the custom thumb over content.

## Non-goals

- No redesign of `StatisticsOverviewPage`.
- No new public route, Quick Open destination, or Command Palette action.
- No new database migration or activity instrumentation.
- No comparison mode between two documents or decks.
- No sorting, grouping by recency, favorites, pinning, or list virtualization.
- No new last-read timestamps or per-deck activity summaries in the entity
  list.
- No change to statistics aggregation semantics outside the new scoped
  time-of-day buckets.
- No change to global Corelib tokens or unrelated desktop pages.
- No horizontal scrolling.

## Information architecture

### Entry from Statistics

1. Opening Statistics from the sidebar still shows `StatisticsOverviewPage`.
2. Opening the Reading app card shows the Reading master-detail workspace with
   `All Reading` selected.
3. Opening the Memora app card shows the Memora master-detail workspace with
   `All Memora` selected.
4. The global Back control returns to the Statistics overview.

### Entry from Library or Memora

1. `View statistics` for a document opens the Reading workspace with that
   document selected in the left pane.
2. `View statistics` for a deck opens the Memora workspace with that deck
   selected.
3. The complete detail is rendered in the right panel; the application does
   not present a separate hidden-looking document or deck statistics screen.
4. The global Back control returns to the recorded origin (`library` or
   `memora`).
5. Selecting `All Reading`, `All Memora`, or another entity does not discard
   the recorded origin. Back still returns to the originating product area.

### Route classification

`StatisticsRouteTarget` remains:

```ts
type StatisticsRouteTarget =
  | { kind: "app"; appKey: string }
  | { kind: "document"; documentId: string }
  | { kind: "deck"; deckId: string };
```

These targets are internal scope state under the existing public Statistics
destination. They do not create new public pages or user operations, so
`PUBLIC_ROUTE_CATALOG` and the Command Palette action registry do not gain new
entries. Existing command-registry coverage for `route.statistics` must
continue to pass.

## Desktop layout

The existing `StatisticsShell` remains the page shell and owns:

- Back navigation and breadcrumb;
- the app title (`Reading` or `Memora`);
- the shared Week / Month / Year picker;
- the outer Statistics `ScrollArea`.

Below the shell header, the built-in app pages render
`StatisticsMasterDetail`:

```text
+--------------------------+  +--------------------------------------------+
| Search                   |  | Selected scope title                       |
| All Reading / All Memora |  | Compact metric strip                       |
| Entity rows              |  | Activity: Heatmap / Graph                  |
|                          |  | Domain-specific detail sections            |
+--------------------------+  +--------------------------------------------+
         272px                         minmax(0, 1fr)
```

Desktop layout requirements:

- content max-width remains `1180px`;
- grid columns are `272px minmax(0, 1fr)`;
- grid gap is `18px`;
- each pane is one top-level surface with `1px var(--border-subtle)`;
- pane radius is `14px`;
- the right panel uses `20px` padding;
- the left pane uses `12px` outer padding around its fixed search/header;
- neither pane contains nested KPI cards;
- sections inside the right pane use spacing and a top divider, not another
  bordered card;
- the selected entity row uses `var(--interactive-selected)` plus a narrow
  `var(--statistics-accent)` indicator;
- shadows are limited to the existing `var(--shadow-card)` on the two
  top-level panes.

## Entity pane

### Shared behavior

- Search is local, immediate, case-insensitive, and does not require debounce.
- `All Reading` or `All Memora` always remains above the filtered entity list.
- Search matches:
  - document title and author;
  - deck name and description.
- An empty filter result shows `No books found` or `No decks found` without
  clearing the current right-panel selection.
- Entity rows are buttons inside a labelled navigation region.
- The current row uses `aria-current="page"`.
- Cover images are decorative because the title is already present in text.
- Keyboard focus uses `var(--focus-ring)`.
- Row selection changes only Statistics scope and right-panel content.
- Selection does not invoke a new application route or mutate data.

### Reading rows

Use only metadata already present on `LibraryDocument`:

- `coverUrl`, with a neutral book fallback when missing;
- title;
- author when present;
- reading progress derived from `lastReadPage / numPages` when both are valid;
- status text only when `documentStatusLabel(document)` is non-empty.

Do not invent a last-read date.

### Memora rows

Use only metadata already present on `Deck`:

- the existing deck color as a small decorative swatch when present;
- deck name;
- description when present;
- `Archived` text for archived decks if archived decks are returned.

Do not issue per-row statistics or card-count requests.

### List loading and failure

- Library documents come from the App's existing document collection.
- The App passes both the documents and the existing library loading state to
  Statistics.
- Memora entities load once through the existing `listDecks` function.
- A deck-list failure affects only the left pane. `All Memora` aggregate
  statistics remain usable and the pane exposes Retry.
- While a deep-linked deck list is loading, the right panel may load detail by
  ID and use `Deck statistics` as its temporary heading.
- When loading completes, the real deck name replaces the temporary heading.
- When a selected document or deck is absent from the resolved entity list,
  show `This book is no longer available` or
  `This deck is no longer available` in the right panel and keep the aggregate
  scope available.

## Right panel

### Shared hierarchy

1. Scope header.
2. Icon-free primary metric strip.
3. Activity section with Heatmap selected by default when no saved preference
   exists, while preserving the existing saved Heatmap/Graph preference.
4. Domain-specific secondary sections.

The scope header shows:

- `All Reading` or `All Memora` for aggregate scope;
- document title and optional author for a document;
- deck name and optional description for a deck.

Metric markup uses a semantic description list. Labels use `12–13px`
secondary text. Primary values use `clamp(24px, 2.2vw, 30px)` and do not
receive icon tiles. Secondary values use `20–24px`.

### Reading aggregate

Primary strip:

- Active time;
- Sessions;
- Average session.

Secondary Reading row:

- Page visits;
- Unique pages;
- Revisits.

Activity:

- Reading-only time buckets;
- Heatmap and Graph;
- no app selector because the scope is already fixed.

### Selected document

Primary strip:

- Active time;
- Sessions;
- Average session.

Reading section:

- Page visits;
- Unique pages;
- Revisits;
- lifetime navigation coverage.

Activity:

- document-scoped Reading time buckets;
- Heatmap and Graph;
- no app selector.

Reviews section:

- Real reviews;
- Recall rate;
- Again count;
- Lapses.

Coverage remains a lifetime snapshot, matching current backend semantics.
Review metrics remain calendar-period bounded.

### Memora aggregate

Primary strip:

- Active time;
- Sessions;
- Reviews;
- Recall rate.

Activity:

- Memora practice plus capped real-review time buckets;
- Heatmap and Graph;
- no app selector.

Ratings:

- one compact four-part distribution component for Again, Hard, Good, Easy;
- zero total shows four labelled zero values and no misleading proportions.

Card states:

- New, Learning, Review, Relearning, Suspended as a compact metric group.

Performance:

- Practice active time;
- Average answer time;
- Lapse rate;
- Active days.

Due forecast:

- Due today;
- Due next 7 days;
- Due next 30 days.

### Selected deck

Primary strip:

- Active time;
- Sessions;
- Reviews;
- Recall rate.

Activity:

- deck-scoped practice plus capped real-review time buckets;
- Heatmap and Graph;
- no app selector.

Ratings, Card states, Performance, and Due forecast use the same compact
components as aggregate Memora. Deck Performance omits Active days and
Practice active time because `DeckStatisticsDetail` does not expose them.

## Activity visualization

`ActivityChartCard` remains the shared visualization component, with these
changes:

- an `embedded` variant removes its outer border, background, shadow, radius,
  and duplicate padding when it is rendered inside the right pane;
- a fixed-scope detail page does not render the `All apps` combobox;
- Heatmap is available whenever `timeBuckets` is provided;
- the existing saved chart-view preference remains authoritative;
- graph mode continues to default to Daily for Week/Month and Weekly for Year;
- current graph keyboard and pointer interactions remain unchanged;
- the shared blue palette remains unchanged:
  - light strongest tone `#456079`;
  - dark strongest tone `#83c3ff`;
- no gradients and no persistent graph markers return;
- Heatmap remains width-constrained and never becomes horizontally scrollable.

## Scoped time-bucket contract

Add `timeBuckets: StatisticsTimeBucket[]` to:

```ts
ReadingStatistics
DocumentStatistics
MemoraStatistics
DeckStatisticsDetail
```

The Rust response structs receive the same field.

Semantics:

- every response materializes six four-hour buckets per calendar day;
- future buckets are present with `isFuture: true` and `activeMs: 0`;
- Reading aggregate includes all Reading activity sessions in the period;
- document detail includes only Reading sessions whose
  `context_kind='document'` and `context_id` equals the document ID;
- Memora aggregate combines Memora Practice session buckets with capped real
  review time;
- deck detail includes only Practice sessions whose
  `context_kind='deck'` and `context_id` equals the deck ID, plus capped review
  time for cards in that deck;
- Reading buckets use `appKey: "reading"`;
- Memora buckets use `appKey: "memora"`;
- activity from another document or deck never leaks into the selected item;
- review time continues to use the existing five-minute per-review cap;
- legacy activity without `activity_session_time_buckets` remains visible in
  daily Graph totals but is not assigned a fabricated time of day in Heatmap.

No new Tauri commands are required. Existing commands return the extended
payloads:

- `get_reading_statistics`;
- `get_document_statistics`;
- `get_memora_statistics`;
- `get_deck_statistics_detail`.

## Data and state flow

```text
App route + documents + listDecks
                  |
                  v
           StatisticsPage
      derives Reading/Memora workspace
                  |
          entity selection callback
                  |
                  v
      app/document/deck scope state
                  |
                  v
 dedicated page loader for period + ID
                  |
                  v
 metric strip + heatmap/graph + detail sections
```

`StatisticsPage` remains the sole scope coordinator. Workspaces receive the
selected ID and callbacks; they do not create a second competing route state.
Changing calendar period refetches only the selected right-panel payload.
Changing scope replaces the right-panel loader while preserving the chosen
period.

Every asynchronous page loader uses a cancellation flag so a slow response
from a previously selected item cannot replace the current selection.

## Loading, empty, and error states

- Right-panel loading keeps both pane shells mounted and replaces only content
  with a skeleton.
- A period with zero activity still renders zero-valued metrics and an empty
  Heatmap/Graph; it is not treated as a missing-data empty state.
- A statistics command failure renders Retry inside the right panel.
- Retry repeats only the active scope request.
- Switching scope clears a previous scope error before loading the new scope.
- Deck-list errors and right-panel statistics errors are independent.
- A missing deep-linked entity has an unavailable state, not a generic
  statistics command error.

## Responsive behavior

At viewport widths above `1180px`:

- render the `272px / minmax(0, 1fr)` master-detail grid;
- the entity pane is sticky below the Statistics header;
- its entity list may scroll independently;
- wheel gestures at the entity-list boundary hand off to the outer Statistics
  `ScrollArea`.

At `1180px` and below:

- collapse the entity pane into a searchable scope selector above the right
  panel;
- render one content column;
- keep the current right-panel selection;
- do not duplicate the desktop entity list visually;
- the outer Statistics `ScrollArea` owns page scrolling.

At `720px` and below:

- controls remain at least `36px` high;
- metric strips become two columns and then one column when required by
  content width;
- right-panel padding becomes `16px`;
- no horizontal overflow is allowed.

## WKWebView scroll contract

The new long entity list must use `ScrollArea`; it must not use
`overflow-y: auto` or native scrollbar pseudo-element overrides.

Required DOM contract:

```tsx
<ScrollArea data-testid="statistics-entity-scroll-area">
  <div
    className="statistics-entity-pane__scroll-content"
    data-testid="statistics-entity-scroll-content"
  >
    {rows}
  </div>
</ScrollArea>
```

`.statistics-entity-pane__scroll-content` reserves at least `20px` on the
thumb side. Row text, actions, focus rings, and selected-row backgrounds end
before that inset. The existing outer
`.statistics-shell__content` retains its exact `20px` right-side inset.

The entity pane, outer shell, custom thumb, and selected surfaces use existing
theme tokens in light and dark mode. No white track color is hard-coded.

## Component boundaries

Create:

- `components/StatisticsMasterDetail.tsx`
  - shared desktop/collapsed workspace structure;
  - entity search, All scope, rows, unavailable/list states;
  - the only owner of the entity-list `ScrollArea`.
- `components/StatisticsMetricStrip.tsx`
  - semantic, icon-free primary and secondary metrics.
- `components/StatisticsDetailSection.tsx`
  - content-only section heading, action, loading, error, and empty states;
  - uses dividers and spacing instead of a nested card surface.
- `components/RatingDistribution.tsx`
  - compact Again/Hard/Good/Easy distribution with truthful zero handling.
- `pages/ReadingStatisticsWorkspace.tsx`
  - adapts `LibraryDocument` data to the master-detail component;
  - renders aggregate Reading or selected Document detail.
- `pages/MemoraStatisticsWorkspace.tsx`
  - owns one `listDecks` request and retry state;
  - adapts `Deck` data;
  - renders aggregate Memora or selected Deck detail.

Modify:

- `StatisticsPage.tsx`
  - maps document targets to Reading and deck targets to Memora;
  - coordinates scope and origin-aware Back behavior;
  - preserves `RegisteredAppStatisticsPage` for non-built-in registry apps.
- the four built-in detail page components
  - load data;
  - render content-only right-panel sections using shared primitives;
  - accept entity metadata where needed.
- `ActivityChartCard.tsx`
  - omit app filtering for fixed scopes;
  - add the embedded visual variant used by the right panel.
- `statistics.css`
  - master-detail, metric strip, distribution, entity rows, responsive and
    scroll-inset styles.
- Rust and TypeScript statistics contracts
  - expose scoped time buckets.
- `App.tsx`
  - pass documents, library loading state, and `listDecks` into Statistics.

Do not create a second Statistics stylesheet or duplicate Heatmap/Graph
implementations.

## Accessibility

- Pane landmarks have unique accessible labels.
- Search inputs have explicit `aria-label` values.
- Entity buttons expose full document/deck names and `aria-current="page"`.
- Decorative covers and color swatches are hidden from assistive technology.
- Metric strips use `dl`, `dt`, and `dd`.
- Right-panel sections use ordered heading levels.
- Heatmap cells and Graph retain current keyboard behavior and accessible
  labels.
- Color is not the only selected-state indicator; the active row also uses
  `aria-current` and a structural accent edge.
- Empty, unavailable, loading, and error messages use appropriate status or
  alert semantics.
- All controls preserve visible focus and current desktop/mobile target sizes.

## Test strategy

### Rust repository tests

Add deterministic tests proving:

1. Reading aggregate time buckets include two documents while document detail
   includes only its own session.
2. Document time buckets zero-fill the selected calendar period and mark future
   days.
3. Memora aggregate time buckets combine Practice and capped review time.
4. Deck detail buckets include only that deck's Practice and card reviews.
5. A second deck's activity and reviews do not leak into the selected deck.
6. Daily bucket totals remain unchanged by the new time-bucket response field.
7. No migration is created.

### TypeScript bridge tests

Update fixtures for all four detail responses and prove:

1. command names and input payloads are unchanged;
2. `timeBuckets` is exposed with camelCase fields;
3. app keys remain the `"reading" | "memora"` union.

### React component tests

Add focused tests proving:

1. Reading renders `All Reading`, document rows, and the aggregate detail by
   default.
2. Memora renders `All Memora`, deck rows, and aggregate detail by default.
3. Search filters by the supported metadata and presents a truthful empty
   filter state.
4. Selecting a document/deck changes right-panel scope without removing the
   workspace.
5. A deep-linked target starts selected.
6. Missing targets render the unavailable state.
7. Deck-list loading/error/retry is independent from aggregate statistics.
8. Primary and secondary metrics render without repeated icon tiles.
9. Built-in app, document, and deck pages expose Heatmap and Graph but no
   `All apps` combobox.
10. Period changes refetch the current scope.
11. Rapid scope changes cannot show a stale previous response.
12. Rating distribution handles zero and non-zero totals.
13. Existing third-party registered apps still use the generic detail page.

### App routing tests

Prove:

1. Sidebar Statistics still opens the unchanged overview.
2. Library `View statistics` opens Reading with the document selected.
3. Memora `View statistics` opens Memora with the deck selected.
4. Back returns to Statistics overview for Statistics-origin app pages.
5. Back returns to Library/Memora for context-origin app pages.

### CSS and scroll regression tests

Assert:

1. desktop workspace columns are `272px minmax(0, 1fr)`;
2. the collapse breakpoint is `1180px`;
3. metric strips have no minimum KPI-card height or icon-tile dependency;
4. only the two top-level panes are bordered surfaces;
5. the entity list uses `ScrollArea`;
6. the immediate entity-scroll child has at least `20px` right padding;
7. outer Statistics content retains exactly `20px` right padding at every
   breakpoint;
8. no new `overflow: auto`, `overflow-y: auto`, native scrollbar selector,
   horizontal scroll, gradient, `max-content`, or raw non-accent color appears;
9. the fixed blue visualization tokens and Year heatmap density remain
   unchanged;
10. mobile controls remain at least `36px` high.

### Fresh desktop runtime verification

The implementation is not visually complete until a fresh runtime from the
implementing checkout verifies:

1. source commit and dirty status are recorded;
2. any existing Tauri/Vite/Library processes are identified and not silently
   reused;
3. `tauri dev` is restarted from the current checkout;
4. Reading and Memora are inspected with both short and long entity lists;
5. light and dark themes show no white scrollbar track;
6. the custom thumb does not cover row text, selection backgrounds, or focus
   rings;
7. nested wheel gestures scroll the entity list and hand off at boundaries;
8. the layout is inspected above and below the `1180px` collapse breakpoint;
9. document/deck switching, Heatmap/Graph, period changes, Back behavior, and
   unavailable states match this specification.

## Acceptance criteria

- Statistics overview is functionally and visually unchanged.
- Reading and Memora use the approved master-detail workspace.
- All documents and decks are discoverable and searchable from their app page.
- A selected document or deck renders its complete detail in the right panel.
- Built-in app/detail metrics do not repeat generic chart icons.
- Session counts no longer occupy oversized standalone cards.
- Reading, Memora, document, and deck scopes all expose Heatmap and Graph.
- Scoped Heatmap data cannot leak across documents or decks.
- Fixed-scope pages do not show an `All apps` selector.
- The selected scope and origin-aware Back behavior are predictable.
- The layout collapses cleanly without horizontal scrolling.
- The entity list and outer Statistics page comply with the Corelib
  `ScrollArea` and `20px` inset rules.
- Light/dark tokens, blue visualization palette, focus states, and mobile
  control sizes remain correct.
- Focused Rust, bridge, React, registry, token, and ScrollArea tests pass.
- The full frontend suite, production frontend build, Rust tests, and
  `git diff --check` pass.
- Fresh `tauri dev` verification records the tested commit, launch mode, and
  current-checkout artifact/process.
