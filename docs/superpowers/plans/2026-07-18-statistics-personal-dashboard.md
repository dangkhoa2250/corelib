# Statistics Personal Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a token-correct, accessible, extensible personal Statistics UI with Overview, Reading, Memora, document, and deck drill-down.

**Architecture:** One public Statistics route owns internal app/item views. A typed registry supplies app summaries, while reusable KPI, chart, state, and scroll components render normalized view models. CSS-grid heatmap and SVG graph share range, app, and color state without adding a chart dependency.

**Tech Stack:** React 19, TypeScript, CSS semantic tokens, Tauri typed bridge, Vitest, Testing Library.

**Depends on:** `2026-07-18-statistics-local-foundation.md` completed and clean.

---

## File map

**Create under `apps/desktop/src/features/statistics/`:**

- `StatisticsPage.tsx`, `StatisticsPage.test.tsx`, `statistics.css`.
- `registry.ts`, `registry.test.ts`.
- `preferences.ts`, `preferences.test.ts`.
- `components/StatisticsShell.tsx`, `StatisticsRangePicker.tsx`, `KpiCard.tsx`.
- `components/MetricSection.tsx`, `StatisticsStates.tsx`.
- `components/ActivityChartCard.tsx`, `ActivityHeatmap.tsx`, `ActivityGraph.tsx`, `StatisticsColorPicker.tsx`.
- Matching focused `*.test.tsx` files for shared components.
- `pages/StatisticsOverviewPage.tsx`, `ReadingStatisticsPage.tsx`, `DocumentStatisticsPage.tsx`, `MemoraStatisticsPage.tsx`, `DeckStatisticsPage.tsx`.

**Modify:**

- `apps/desktop/src/app/routes.ts`, `commandRegistry.test.ts`, `AppSidebar.tsx`, `icons.tsx`, `App.tsx`, `App.test.tsx`.
- `apps/desktop/src/styles/tokens.css`, `tokens.test.ts`.
- `apps/desktop/src/features/library/DocumentCard.tsx` and test.
- `apps/desktop/src/features/memora/DeckDetailPage.tsx` and test.
- `apps/desktop/src/domain/statistics.ts` only when adding chart-ready types missing from the foundation.

## Task 1: Add chart preferences and safe color derivation

**Files:**
- Create: `apps/desktop/src/features/statistics/preferences.ts`
- Create: `apps/desktop/src/features/statistics/preferences.test.ts`

- [ ] **Step 1: Write failing preference tests**

```ts
import { expect, test } from "vitest";
import { deriveStatisticsPalette, loadStatisticsPreferences, saveStatisticsPreferences } from "./preferences";

test("stores one normalized base color under a versioned key", () => {
  saveStatisticsPreferences({ baseColor: "#3778D4", chartView: "graph" });
  expect(loadStatisticsPreferences()).toEqual({ baseColor: "#3778d4", chartView: "graph" });
});

test("derives five ordered OKLCH color-mix expressions", () => {
  expect(deriveStatisticsPalette("#3778d4", "dark")).toEqual([
    "color-mix(in oklch, #3778d4 28%, var(--surface-1))",
    "color-mix(in oklch, #3778d4 45%, var(--surface-1))",
    "color-mix(in oklch, #3778d4 62%, var(--surface-1))",
    "color-mix(in oklch, #3778d4 79%, var(--surface-1))",
    "color-mix(in oklch, #3778d4 96%, var(--surface-1))",
  ]);
});
```

Also test malformed storage JSON, invalid hex, near-white/near-black normalization, and default `{ baseColor: "#3778d4", chartView: "heatmap" }`.

- [ ] **Step 2: Verify failure**

```bash
cd apps/desktop && npm test -- src/features/statistics/preferences.test.ts
```

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement preferences**

Use storage key `library.statistics.preferences.v1`. Accept only `/^#[0-9a-f]{6}$/i`. Normalize with this exact pipeline so custom colors remain visible and every implementation produces the same stored value:

1. Lowercase the six-digit hex string and convert sRGB to HSL using the standard CSS HSL conversion.
2. Preserve hue. Clamp saturation to `0%..90%` and lightness to `28%..72%`.
3. Convert the clamped HSL value back to a lowercase six-digit sRGB hex string, rounding each channel to the nearest integer.
4. Invalid input falls back to `#3778d4`; achromatic colors remain achromatic.

Add table-driven tests proving `#ffffff` becomes `#b8b8b8`, `#000000` becomes `#474747`, an over-saturated color is capped at `90%` saturation after a round trip, and `#3778d4` is unchanged. Return these mix percentages:

```ts
const LIGHT_MIX = [18, 36, 55, 76, 96] as const;
const DARK_MIX = [28, 45, 62, 79, 96] as const;
```

Expose:

```ts
export type StatisticsChartView = "heatmap" | "graph";
export interface StatisticsPreferences { baseColor: string; chartView: StatisticsChartView; }
export function loadStatisticsPreferences(): StatisticsPreferences;
export function saveStatisticsPreferences(value: StatisticsPreferences): void;
export function deriveStatisticsPalette(baseColor: string, theme: "light" | "dark"): string[];
```

Storage errors return defaults and never break Statistics.

- [ ] **Step 4: Verify tests**

```bash
cd apps/desktop && npm test -- src/features/statistics/preferences.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/statistics/preferences.ts apps/desktop/src/features/statistics/preferences.test.ts
git commit -m "feat: add statistics chart preferences"
```

## Task 2: Register the public Statistics route correctly

**Files:**
- Modify: `apps/desktop/src/app/routes.ts`
- Modify: `apps/desktop/src/app/commandRegistry.test.ts`
- Modify: `apps/desktop/src/app/AppSidebar.tsx`
- Modify: `apps/desktop/src/app/icons.tsx`
- Modify: `apps/desktop/src/app/App.tsx`
- Modify: `apps/desktop/src/app/App.test.tsx`

- [ ] **Step 1: Write failing route and sidebar tests**

Extend the registry test:

```ts
expect(PUBLIC_ROUTE_CATALOG.statistics).toEqual({
  id: "route.statistics",
  title: "Statistics",
  aliases: ["analytics", "activity", "progress", "insights"],
  breadcrumb: ["Statistics"],
  route: { name: "statistics" },
});
```

In `App.test.tsx`, assert the primary navigation has a Statistics button and clicking it renders the Statistics heading. Search Quick Open for `insights` and assert it executes `{ name: "statistics" }`.

- [ ] **Step 2: Verify failures**

```bash
cd apps/desktop && npm test -- src/app/commandRegistry.test.ts src/app/App.test.tsx
```

Expected: FAIL because the route is not registered.

- [ ] **Step 3: Add the typed route and navigation**

Add this route target once so later context links do not change the union again:

```ts
export type StatisticsRouteTarget =
  | { kind: "app"; appKey: string }
  | { kind: "document"; documentId: string }
  | { kind: "deck"; deckId: string };

// AppRoute member
{ name: "statistics"; target?: StatisticsRouteTarget; origin?: "library" | "memora" }
```

Add `statistics` to `publicRouteNames` and add the exact catalog entry from Step 1 using `{ name: "statistics" }`. Add an `IconStatistics` using the same stroke/currentColor conventions as existing icons. Add the nav item to `NAV_ITEMS` and include `statistics` in `AppSection` and `App.tsx` active-section mapping.

Render a temporary `<main><h1>Statistics</h1></main>` route branch only until Task 7 replaces it. Do not add a Command Palette action.

- [ ] **Step 4: Verify command coverage and build**

```bash
cd apps/desktop
npm test -- src/app/commandRegistry.test.ts src/app/App.test.tsx
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/app/routes.ts apps/desktop/src/app/commandRegistry.test.ts apps/desktop/src/app/AppSidebar.tsx apps/desktop/src/app/icons.tsx apps/desktop/src/app/App.tsx apps/desktop/src/app/App.test.tsx
git commit -m "feat: register statistics destination"
```

## Task 3: Build token-correct shared shells and KPI components

**Files:**
- Create: `apps/desktop/src/features/statistics/statistics.css`
- Create: `apps/desktop/src/features/statistics/components/StatisticsShell.tsx`
- Create: `apps/desktop/src/features/statistics/components/StatisticsRangePicker.tsx`
- Create: `apps/desktop/src/features/statistics/components/KpiCard.tsx`
- Create: `apps/desktop/src/features/statistics/components/MetricSection.tsx`
- Create: `apps/desktop/src/features/statistics/components/StatisticsStates.tsx`
- Create: `apps/desktop/src/features/statistics/components/StatisticsShell.test.tsx`
- Create: `apps/desktop/src/features/statistics/components/KpiCard.test.tsx`
- Modify: `apps/desktop/src/styles/tokens.css`
- Modify: `apps/desktop/src/styles/tokens.test.ts`

- [ ] **Step 1: Write failing shell, inset, and token tests**

```tsx
test("uses ScrollArea and reserves the vertical thumb inset", () => {
  render(<StatisticsShell title="Statistics"><div>body</div></StatisticsShell>);
  expect(screen.getByTestId("statistics-scroll-area")).toHaveStyle({ overflow: "hidden" });
  expect(screen.getByTestId("statistics-scroll-content")).toHaveClass("statistics-shell__content");
});
```

In `tokens.test.ts`, read the CSS source and assert Statistics CSS uses `padding-right: 20px`, `padding-bottom: 20px` for the chart scroller, and no `overflow: auto`, hard-coded white/black backgrounds, or copied Admin hex colors.

- [ ] **Step 2: Verify failures**

```bash
cd apps/desktop && npm test -- src/features/statistics/components/StatisticsShell.test.tsx src/styles/tokens.test.ts
```

Expected: FAIL because components and CSS are absent.

- [ ] **Step 3: Implement reusable primitives**

`StatisticsShell` must render `ScrollArea` with immediate child `.statistics-shell__content`. `StatisticsRangePicker` receives `StatisticsRange`, emits one value, and exposes `aria-pressed` on 7d/30d/1y/all buttons. `KpiCard` renders label/value/help without owning data loading. `MetricSection` owns title, optional action, and section-level state.

Use only semantic tokens:

```css
.statistics-shell { height: 100%; background: var(--main-bg); color: var(--text-primary); }
.statistics-shell__content { min-height: 100%; padding: 28px 20px 40px 28px; }
.statistics-card { background: var(--surface-1); border: 1px solid var(--border-subtle); box-shadow: var(--shadow-card); }
.statistics-muted { color: var(--text-secondary); }
.statistics-control[aria-pressed="true"] { background: var(--interactive-selected); }
```

Do not add theme-specific selectors unless an existing semantic token cannot express the state.

- [ ] **Step 4: Verify focused tests**

```bash
cd apps/desktop && npm test -- src/features/statistics/components src/styles/tokens.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/statistics/statistics.css apps/desktop/src/features/statistics/components apps/desktop/src/styles/tokens.css apps/desktop/src/styles/tokens.test.ts
git commit -m "feat: add reusable statistics UI primitives"
```

## Task 4: Implement the accessible heatmap

**Files:**
- Create: `apps/desktop/src/features/statistics/components/ActivityHeatmap.tsx`
- Create: `apps/desktop/src/features/statistics/components/ActivityHeatmap.test.tsx`
- Modify: `apps/desktop/src/features/statistics/statistics.css`

- [ ] **Step 1: Write failing heatmap tests**

Assert fixed bands, 365/366-day rendering, tooltip text, arrow-key movement, all-time year sections, year-level windowing, and summary:

```tsx
expect(screen.getByRole("grid", { name: "Daily activity" })).toBeInTheDocument();
const july17 = screen.getByRole("gridcell", { name: /July 17.*42 minutes/ });
expect(july17).toHaveAttribute("data-level", "3");
july17.focus();
await user.keyboard("{ArrowRight}");
expect(screen.getByRole("gridcell", { name: /July 18/ })).toHaveFocus();
expect(screen.getByText(/22 active days/)).toHaveClass("sr-only");
```

- [ ] **Step 2: Verify failure**

```bash
cd apps/desktop && npm test -- src/features/statistics/components/ActivityHeatmap.test.tsx
```

Expected: FAIL because the component is missing.

- [ ] **Step 3: Implement the heatmap**

Use a CSS grid with one column per week and seven rows. Map minutes to levels exactly: 0, 1-14, 15-29, 30-59, 60-119, 120+. Set `--statistics-level-1` through `--statistics-level-5` on the chart root from the palette utility. Use a nested horizontal `ScrollArea` below the readable minimum width; its immediate content uses `padding-bottom: 20px`.

Each cell is keyboard-focusable through roving `tabIndex`; arrow left/right moves a day and up/down moves a week. The zero cell uses `var(--surface-3)`. Do not use color alone: cell labels and the hidden summary carry exact values. In All time, mount at most three calendar-year grids around the visible year and preserve off-screen space with measured year placeholders; the test must assert a five-year input never mounts more than three `role="grid"` elements.

- [ ] **Step 4: Verify heatmap and scroll tests**

```bash
cd apps/desktop && npm test -- src/features/statistics/components/ActivityHeatmap.test.tsx src/components/ScrollArea.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/statistics/components/ActivityHeatmap.tsx apps/desktop/src/features/statistics/components/ActivityHeatmap.test.tsx apps/desktop/src/features/statistics/statistics.css
git commit -m "feat: add accessible activity heatmap"
```

## Task 5: Implement the accessible SVG graph

**Files:**
- Create: `apps/desktop/src/features/statistics/components/ActivityGraph.tsx`
- Create: `apps/desktop/src/features/statistics/components/ActivityGraph.test.tsx`
- Modify: `apps/desktop/src/features/statistics/statistics.css`

- [ ] **Step 1: Write failing graph tests**

```tsx
test("switches daily weekly and cumulative without losing exact values", async () => {
  const user = userEvent.setup();
  const { rerender } = render(
    <ActivityGraph buckets={dailyBuckets} mode="daily" onModeChange={onModeChange} valueLabel="Active time" />,
  );
  expect(screen.getByRole("img", { name: /active-time trend/ })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Weekly" }));
  expect(onModeChange).toHaveBeenCalledWith("weekly");
  rerender(
    <ActivityGraph buckets={dailyBuckets} mode="weekly" onModeChange={onModeChange} valueLabel="Active time" />,
  );
  expect(screen.getByText(/Week of July 13/)).toBeInTheDocument();
});
```

Also test cumulative monotonic totals, empty series, keyboard point focus, and accessible textual summary. The range-dependent default belongs to `ActivityChartCard`, not this controlled graph primitive.

- [ ] **Step 2: Verify failure**

```bash
cd apps/desktop && npm test -- src/features/statistics/components/ActivityGraph.test.tsx
```

Expected: FAIL because the graph is missing.

- [ ] **Step 3: Implement graph utilities and SVG**

Keep bucket aggregation in pure exported functions in the same focused file until it exceeds 250 lines, then move them to `activitySeries.ts` with their tests. Render one responsive SVG line/area series, semantic grid/axis tokens, roving-focus points, and a visible tooltip. Do not import a chart package.

Expose:

```ts
export type GraphMode = "daily" | "weekly" | "cumulative";
export interface ActivityGraphProps {
  buckets: ActivityBucket[];
  mode: GraphMode;
  onModeChange(mode: GraphMode): void;
  valueLabel: string;
}
```

- [ ] **Step 4: Verify graph tests**

```bash
cd apps/desktop && npm test -- src/features/statistics/components/ActivityGraph.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/statistics/components/ActivityGraph.tsx apps/desktop/src/features/statistics/components/ActivityGraph.test.tsx apps/desktop/src/features/statistics/statistics.css
git commit -m "feat: add accessible activity graph"
```

## Task 6: Compose the shared Activity card and app registry

**Files:**
- Create: `apps/desktop/src/features/statistics/components/ActivityChartCard.tsx`
- Create: `apps/desktop/src/features/statistics/components/ActivityChartCard.test.tsx`
- Create: `apps/desktop/src/features/statistics/components/StatisticsColorPicker.tsx`
- Create: `apps/desktop/src/features/statistics/components/StatisticsColorPicker.test.tsx`
- Create: `apps/desktop/src/features/statistics/registry.ts`
- Create: `apps/desktop/src/features/statistics/registry.test.ts`

- [ ] **Step 1: Write failing state-preservation and registry tests**

```tsx
test("keeps app range and color while switching chart view", async () => {
  const user = userEvent.setup();
  render(<ActivityChartCard totalBuckets={totalBuckets} series={series} range="1y" />);
  await user.selectOptions(screen.getByLabelText("Statistics app"), "memora");
  await user.click(screen.getByRole("button", { name: "Graph" }));
  expect(screen.getByLabelText("Statistics app")).toHaveValue("memora");
  expect(screen.getByRole("button", { name: "1 year" })).toHaveAttribute("aria-pressed", "true");
});
```

Registry test: render Overview from a fake third app definition and assert its card/filter appears without editing Overview.

Add a composition test that a `1y` range entering Graph selects Weekly initially, while `7d` and `30d` select Daily. After the user explicitly changes graph mode, switching Heatmap/Graph must preserve that choice until the range itself changes.

- [ ] **Step 2: Verify failures**

```bash
cd apps/desktop && npm test -- src/features/statistics/components/ActivityChartCard.test.tsx src/features/statistics/registry.test.ts
```

Expected: FAIL because the components and registry are absent.

- [ ] **Step 3: Implement shared composition**

Define:

```ts
export interface AppMetricValue {
  id: string;
  label: string;
  value: number | null;
  unit: "milliseconds" | "count" | "ratio";
}
export interface AppStatisticsSummary {
  appKey: string;
  primary: AppMetricValue;
  secondary: AppMetricValue;
  buckets: ActivityBucket[];
}
export interface AppStatisticsDetail {
  appKey: string;
  metrics: AppMetricValue[];
  buckets: ActivityBucket[];
}
export interface ActivityChartSeries {
  appKey: string;
  title: string;
  buckets: ActivityBucket[];
}
export interface ActivityChartCardProps {
  range: StatisticsRange;
  totalBuckets: ActivityBucket[];
  series: ActivityChartSeries[];
}
export interface StatisticsAppDefinition {
  key: string;
  title: string;
  icon: React.ComponentType;
  loadSummary(range: StatisticsRange): Promise<AppStatisticsSummary>;
  loadDetail(range: StatisticsRange): Promise<AppStatisticsDetail>;
}
```

Create Reading and Memora registrations from injected statistics API functions. Overview code must map registry entries and never compare `definition.key` to hard-coded app names. Adapt the resolved summaries to `ActivityChartSeries[]` by aligning each app's zero-filled daily buckets on `localDay`; the `All apps` option uses `totalBuckets`, while a selected app uses only its matching series. Tooltip rows for `All apps` read the aligned per-app values, so the per-app breakdown is not reconstructed from a single total.

`ActivityChartCard` owns app filter, Heatmap/Graph view, graph mode, palette, and tooltip state. Its exact props are `ActivityChartCardProps`. Color picker writes only the base color. App/range changes reload data through the parent; view/color changes do not.

- [ ] **Step 4: Verify composition tests**

```bash
cd apps/desktop && npm test -- src/features/statistics/components src/features/statistics/registry.test.ts src/features/statistics/preferences.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/statistics/components/ActivityChartCard.tsx apps/desktop/src/features/statistics/components/ActivityChartCard.test.tsx apps/desktop/src/features/statistics/components/StatisticsColorPicker.tsx apps/desktop/src/features/statistics/components/StatisticsColorPicker.test.tsx apps/desktop/src/features/statistics/registry.ts apps/desktop/src/features/statistics/registry.test.ts
git commit -m "feat: compose reusable statistics charts"
```

## Task 7: Build the Overview page from the registry

**Files:**
- Create: `apps/desktop/src/features/statistics/pages/StatisticsOverviewPage.tsx`
- Create: `apps/desktop/src/features/statistics/StatisticsPage.tsx`
- Create: `apps/desktop/src/features/statistics/StatisticsPage.test.tsx`
- Modify: `apps/desktop/src/app/App.tsx`
- Modify: `apps/desktop/src/app/App.test.tsx`

- [ ] **Step 1: Write failing page tests**

Assert three KPI cards only, section-level retry, no-data copy, Activity chart, dynamic app cards, and range reload:

```tsx
expect(await screen.findByText("12h 18m")).toBeInTheDocument();
expect(screen.getByText("Current streak")).toBeInTheDocument();
expect(screen.getByText("Active days")).toBeInTheDocument();
expect(screen.queryByText("Sessions")).not.toBeInTheDocument();
expect(screen.getByRole("heading", { name: "App insights" })).toBeInTheDocument();
```

- [ ] **Step 2: Verify failure**

```bash
cd apps/desktop && npm test -- src/features/statistics/StatisticsPage.test.tsx src/app/App.test.tsx
```

Expected: FAIL because the temporary Statistics branch has no real page.

- [ ] **Step 3: Implement the coordinator and Overview**

`StatisticsPage` owns internal child state:

```ts
type StatisticsView =
  | { kind: "overview" }
  | { kind: "app"; appKey: string }
  | { kind: "document"; documentId: string }
  | { kind: "deck"; deckId: string };
```

It receives the typed statistics API and registry. Overview loads its KPI/activity payload once per range; app summaries use independent `MetricSection` states so one failure does not blank the page. Use `Promise.allSettled`, not `Promise.all`.

Replace the temporary App branch with `StatisticsPage` and keep the public route `{ name: "statistics" }` unchanged.

- [ ] **Step 4: Verify page and route tests**

```bash
cd apps/desktop && npm test -- src/features/statistics/StatisticsPage.test.tsx src/app/App.test.tsx src/app/commandRegistry.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/statistics/pages/StatisticsOverviewPage.tsx apps/desktop/src/features/statistics/StatisticsPage.tsx apps/desktop/src/features/statistics/StatisticsPage.test.tsx apps/desktop/src/app/App.tsx apps/desktop/src/app/App.test.tsx
git commit -m "feat: add personal statistics overview"
```

## Task 8: Add Reading, Memora, document, and deck detail pages

**Files:**
- Create: `apps/desktop/src/features/statistics/pages/ReadingStatisticsPage.tsx`
- Create: `apps/desktop/src/features/statistics/pages/DocumentStatisticsPage.tsx`
- Create: `apps/desktop/src/features/statistics/pages/MemoraStatisticsPage.tsx`
- Create: `apps/desktop/src/features/statistics/pages/DeckStatisticsPage.tsx`
- Create: focused tests beside each page.
- Modify: `apps/desktop/src/features/statistics/StatisticsPage.tsx`

- [ ] **Step 1: Write failing detail tests**

Reading must show active time, sessions, average session time, visits, unique pages, revisits, and trend. Document must keep lifetime coverage separate from ranged metrics and show linked-card outcomes. Memora/deck must show real reviews, recall, rating distribution, capped answer time, states, lapse, and due forecast.

```tsx
expect(screen.getByText("30% coverage")).toBeInTheDocument();
expect(screen.getByText("Lifetime navigation coverage")).toBeInTheDocument();
expect(screen.queryByText(/completed/i)).not.toBeInTheDocument();
expect(screen.getByText("Recall rate")).toBeInTheDocument();
expect(screen.getByText("Again · Hard · Good · Easy")).toBeInTheDocument();
```

- [ ] **Step 2: Verify failures**

```bash
cd apps/desktop && npm test -- src/features/statistics/pages
```

Expected: FAIL because pages are missing.

- [ ] **Step 3: Implement pages by composing shared components**

No page may reimplement KPI card, Activity card, range picker, loading/error shell, tooltip, or color picker. `StatisticsPage` passes breadcrumb and Back callbacks through `StatisticsShell`. Rates with `null` render `—`; they never render `0%`.

App detail Activity defaults to active time and may choose app-native metrics. Item pages use the same range but lifetime coverage remains visibly labeled and unchanged.

- [ ] **Step 4: Verify detail tests**

```bash
cd apps/desktop && npm test -- src/features/statistics/pages src/features/statistics/StatisticsPage.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/statistics/pages apps/desktop/src/features/statistics/StatisticsPage.tsx apps/desktop/src/features/statistics/StatisticsPage.test.tsx
git commit -m "feat: add statistics drill-down pages"
```

## Task 9: Add canonical document and deck context links

**Files:**
- Modify: `apps/desktop/src/features/library/DocumentCard.tsx`
- Modify: `apps/desktop/src/features/library/DocumentCard.test.tsx`
- Modify: `apps/desktop/src/features/memora/DeckDetailPage.tsx`
- Modify: `apps/desktop/src/features/memora/DeckDetailPage.test.tsx`
- Modify: `apps/desktop/src/app/App.tsx`
- Modify: `apps/desktop/src/features/statistics/StatisticsPage.tsx`

- [ ] **Step 1: Write failing navigation tests**

Assert `View statistics` from a document opens the canonical document child view, and the same action from a deck opens the canonical deck child view. Assert Back returns to the originating surface and no duplicate embedded dashboard is rendered.

- [ ] **Step 2: Verify failures**

```bash
cd apps/desktop && npm test -- src/features/library/DocumentCard.test.tsx src/features/memora/DeckDetailPage.test.tsx src/app/App.test.tsx
```

Expected: FAIL because context actions are absent.

- [ ] **Step 3: Add context actions**

Add optional callbacks `onViewStatistics(documentId)` and `onViewStatistics(deckId)` to the existing components. App opens `{ name: "statistics", target: { kind: "document", documentId }, origin: "library" }` or `{ name: "statistics", target: { kind: "deck", deckId }, origin: "memora" }`; do not add public catalog entries per item. `StatisticsPage` initializes its internal view from `route.target`, and Back calls the App-provided origin callback.

- [ ] **Step 4: Verify navigation tests**

```bash
cd apps/desktop && npm test -- src/features/library/DocumentCard.test.tsx src/features/memora/DeckDetailPage.test.tsx src/features/statistics/StatisticsPage.test.tsx src/app/App.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/library/DocumentCard.tsx apps/desktop/src/features/library/DocumentCard.test.tsx apps/desktop/src/features/memora/DeckDetailPage.tsx apps/desktop/src/features/memora/DeckDetailPage.test.tsx apps/desktop/src/features/statistics/StatisticsPage.tsx apps/desktop/src/app/App.tsx
git commit -m "feat: link documents and decks to statistics"
```

## Task 10: Verify themes, scrollbar behavior, and fresh desktop runtime

**Files:** Modify only to fix defects found in this task.

- [ ] **Step 1: Run automated checks**

```bash
cd apps/desktop
npm test
npm run build
cd ../..
cargo test --all-targets --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo clippy --all-targets --all-features --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings
```

Expected: PASS.

- [ ] **Step 2: Record exact checkout and kill stale-runtime assumptions**

```bash
git rev-parse --short HEAD
git status --short
pgrep -fal 'tauri dev|vite|library_desktop' || true
```

Expected: commit and worktree state are recorded. Stop/restart any existing development processes instead of reusing them.

- [ ] **Step 3: Launch a fresh development app**

```bash
cd apps/desktop
npm run tauri dev
```

Expected: a new Tauri app built from the recorded checkout.

- [ ] **Step 4: Complete the manual matrix**

Verify in both light and dark mode:

- Overview, every detail page, empty/loading/error/disabled/hover/focus/selected/tooltip states.
- Three KPI cards collapse correctly at narrow width.
- Heatmap and Graph preserve range/app/color state.
- Custom near-white and near-black colors remain distinguishable.
- Long page uses the overlay vertical thumb with at least 20px content clearance.
- Narrow heatmap uses the overlay horizontal thumb with at least 20px bottom clearance.
- No white native WKWebView track appears and no thumb covers controls, cell focus, or card backgrounds.
- Sidebar and Quick Open both open Statistics.

- [ ] **Step 5: Finish verification**

If no defects were found, leave the worktree clean and report the commit and `tauri dev` launch mode. If a defect was found, add a new explicit failing test for that defect, fix it, rerun Steps 1-4, and commit with a message naming the defect; never create a generic verification commit.
