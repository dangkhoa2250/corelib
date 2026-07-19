# Statistics Dashboard Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild personal Statistics with calendar navigation, polished KPI and app cards, a responsive day-by-time heatmap, flat shared dropdowns, and token-correct light/dark styling.

**Architecture:** `StatisticsPage` owns one calendar period and internal drill-down state. Pure period helpers drive an accessible header control; normalized backend buckets feed focused KPI, heatmap, graph, and app-card components. Shared `Combobox` gains a non-searchable mode, while Statistics CSS uses only semantic surfaces and keeps the heatmap inside its card without horizontal scrolling.

**Tech Stack:** React 19, TypeScript, CSS Grid, semantic CSS tokens, Tabler React icons, Tauri bridge, Vitest, Testing Library.

**Depends on:** `docs/superpowers/plans/2026-07-19-statistics-calendar-time-buckets.md`

**Design:** `docs/superpowers/specs/2026-07-19-statistics-dashboard-visual-refresh-design.md`

---

## File map

- Create `apps/desktop/src/features/statistics/period.ts` and `.test.ts` for local calendar period math and labels.
- Replace the personal `StatisticsRangePicker.tsx` with `StatisticsPeriodPicker.tsx`; Admin Analytics receives a small server-range picker under its own feature.
- Modify `StatisticsShell.tsx` and test to host the period unit, period label, and icon navigation.
- Modify shared `components/Combobox.tsx` and tests with optional non-searchable behavior.
- Modify `ActivityChartCard.tsx` and Admin Analytics to use the shared flat dropdown.
- Create `MiniSparkline.tsx` and test for small truthful metric trends.
- Modify `KpiCard.tsx`, `AppInsightCard.tsx`, registry types, and tests for the approved card hierarchy.
- Replace `ActivityHeatmap.tsx` and tests with the day-by-time grid.
- Modify `ActivityGraph.tsx`, overview/detail pages, and `StatisticsPage.tsx` to consume calendar periods.
- Rewrite `features/statistics/statistics.css` and extend `styles/tokens.test.ts` with theme/gradient/scroll regression checks.
- Modify `apps/desktop/package.json` and lockfile to use Tabler's maintained icon components instead of drawing new SVG assets.

## Task 1: Add the maintained icon library

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/package-lock.json`

- [ ] **Step 1: Install Tabler React icons from the desktop package**

```bash
cd apps/desktop && npm install @tabler/icons-react
```

Expected: `@tabler/icons-react` appears in dependencies and the lockfile updates without changing unrelated packages.

- [ ] **Step 2: Verify TypeScript can resolve the selected icons**

```bash
node -e "const p=require('./node_modules/@tabler/icons-react/package.json'); if(!p.version) process.exit(1)"
```

Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/package.json apps/desktop/package-lock.json
git commit -m "build: add statistics icon library"
```

## Task 2: Implement local calendar-period math

**Files:**
- Create: `apps/desktop/src/features/statistics/period.ts`
- Create: `apps/desktop/src/features/statistics/period.test.ts`

- [ ] **Step 1: Write failing pure-function tests**

```ts
import { describe, expect, test } from "vitest";
import { currentPeriod, formatPeriodLabel, shiftPeriod } from "./period";

describe("statistics calendar periods", () => {
  test("uses Monday through Sunday for a week", () => {
    expect(currentPeriod("week", "2026-07-19")).toEqual({
      unit: "week",
      anchorLocalDay: "2026-07-13",
    });
    expect(formatPeriodLabel({ unit: "week", anchorLocalDay: "2026-07-13" }, "en-US"))
      .toBe("Jul 13–19, 2026");
  });

  test("shifts calendar months without date overflow", () => {
    expect(shiftPeriod({ unit: "month", anchorLocalDay: "2026-03-01" }, -1))
      .toEqual({ unit: "month", anchorLocalDay: "2026-02-01" });
  });

  test("marks next disabled at the current period", () => {
    const period = currentPeriod("year", "2026-07-19");
    expect(shiftPeriod(period, 1).anchorLocalDay).toBe("2027-01-01");
  });
});
```

- [ ] **Step 2: Run and verify RED**

```bash
cd apps/desktop && npm test -- src/features/statistics/period.test.ts
```

Expected: FAIL because `period.ts` does not exist.

- [ ] **Step 3: Implement date-only helpers without UTC parsing drift**

Export this API:

```ts
import type { StatisticsPeriod, StatisticsPeriodUnit } from "../../domain/statistics";

export function todayLocalDay(now = new Date()): string;
export function currentPeriod(unit: StatisticsPeriodUnit, today?: string): StatisticsPeriod;
export function shiftPeriod(period: StatisticsPeriod, amount: -1 | 1): StatisticsPeriod;
export function isCurrentPeriod(period: StatisticsPeriod, today?: string): boolean;
export function formatPeriodLabel(period: StatisticsPeriod, locale?: string): string;
```

Parse `YYYY-MM-DD` into numeric year/month/day, construct local `Date(year, monthIndex, day)`, and serialize with local getters. Normalize anchors to Monday, first of month, or January 1. Use `Intl.DateTimeFormat` for labels and an en dash for week ranges.

- [ ] **Step 4: Verify GREEN**

```bash
cd apps/desktop && npm test -- src/features/statistics/period.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/statistics/period.ts apps/desktop/src/features/statistics/period.test.ts
git commit -m "feat: add statistics calendar period helpers"
```

## Task 3: Replace the range buttons with calendar navigation

**Files:**
- Create: `apps/desktop/src/features/statistics/components/StatisticsPeriodPicker.tsx`
- Create: `apps/desktop/src/features/statistics/components/StatisticsPeriodPicker.test.tsx`
- Delete: `apps/desktop/src/features/statistics/components/StatisticsRangePicker.tsx`
- Create: `apps/desktop/src/features/admin/AdminAnalyticsRangePicker.tsx`
- Create: `apps/desktop/src/features/admin/AdminAnalyticsRangePicker.test.tsx`
- Modify: `apps/desktop/src/domain/account.ts`
- Modify: `apps/desktop/src/features/statistics/components/StatisticsShell.tsx`
- Modify: `apps/desktop/src/features/statistics/components/StatisticsShell.test.tsx`
- Modify: `apps/desktop/src/features/statistics/StatisticsPage.tsx`
- Modify: personal statistics page prop types and tests.

- [ ] **Step 1: Write failing interaction tests**

```tsx
test("navigates periods with icon-only previous and next buttons", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <StatisticsPeriodPicker
      period={{ unit: "month", anchorLocalDay: "2026-06-01" }}
      todayLocalDay="2026-07-19"
      onChange={onChange}
    />,
  );
  expect(screen.getByText("June 2026")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Previous month" })).toHaveTextContent("");
  await user.click(screen.getByRole("button", { name: "Next month" }));
  expect(onChange).toHaveBeenCalledWith({ unit: "month", anchorLocalDay: "2026-07-01" });
});

test("disables next in the current period and resets anchor when unit changes", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <StatisticsPeriodPicker
      period={{ unit: "month", anchorLocalDay: "2026-07-01" }}
      todayLocalDay="2026-07-19"
      onChange={onChange}
    />,
  );
  expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Year" }));
  expect(onChange).toHaveBeenCalledWith({ unit: "year", anchorLocalDay: "2026-01-01" });
});
```

- [ ] **Step 2: Run and verify RED**

```bash
cd apps/desktop && npm test -- src/features/statistics/components/StatisticsPeriodPicker.test.tsx
```

Expected: FAIL because the component is absent.

- [ ] **Step 3: Implement the picker and propagate `StatisticsPeriod`**

Use `IconChevronLeft` and `IconChevronRight` from `@tabler/icons-react`. The component structure is:

```tsx
<div className="statistics-period-control">
  <div className="statistics-period-units" role="group" aria-label="Statistics period">
    {(["week", "month", "year"] as const).map((unit) => (
      <button aria-pressed={period.unit === unit} onClick={() => onChange(currentPeriod(unit, todayLocalDay))}>
        {unit[0].toUpperCase() + unit.slice(1)}
      </button>
    ))}
  </div>
  <div className="statistics-period-navigation">
    <button aria-label={`Previous ${period.unit}`} title={`Previous ${period.unit}`}><IconChevronLeft /></button>
    <span aria-live="polite">{formatPeriodLabel(period)}</span>
    <button aria-label={`Next ${period.unit}`} title={`Next ${period.unit}`} disabled={isCurrentPeriod(period, todayLocalDay)}><IconChevronRight /></button>
  </div>
</div>
```

`StatisticsPage` initializes `currentPeriod("month")`, owns `StatisticsPeriod`, and passes it through the shell, overview, registry loaders, and detail pages. Delete every personal use of `StatisticsRange`.

Keep Admin Analytics on its existing server ranges by adding this type to `domain/account.ts`:

```ts
export type AdminAnalyticsRange = "7d" | "30d" | "1y" | "all";
```

Create `AdminAnalyticsRangePicker` with the existing four labels and typed callback:

```tsx
const RANGES: { value: AdminAnalyticsRange; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "1y", label: "1 year" },
  { value: "all", label: "All time" },
];
```

Admin Analytics imports this admin-owned component and type, so the personal calendar-period contract never leaks into the PocketBase range API.

- [ ] **Step 4: Verify picker, shell, and page tests**

```bash
cd apps/desktop && npm test -- src/features/statistics/components/StatisticsPeriodPicker.test.tsx src/features/statistics/components/StatisticsShell.test.tsx src/features/statistics/StatisticsPage.test.tsx src/features/admin/AdminAnalyticsRangePicker.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/statistics apps/desktop/src/features/admin/AdminAnalyticsRangePicker.tsx apps/desktop/src/features/admin/AdminAnalyticsRangePicker.test.tsx apps/desktop/src/features/admin/AdminAnalyticsPage.tsx apps/desktop/src/domain/statistics.ts apps/desktop/src/domain/account.ts
git commit -m "feat: navigate statistics by calendar period"
```

## Task 4: Add a flat non-searchable mode to the shared Combobox

**Files:**
- Modify: `apps/desktop/src/components/Combobox.tsx`
- Modify: `apps/desktop/src/components/Combobox.test.tsx`
- Modify: `apps/desktop/src/features/statistics/components/ActivityChartCard.tsx`
- Modify: `apps/desktop/src/features/statistics/components/ActivityChartCard.test.tsx`
- Modify: `apps/desktop/src/features/admin/AdminAnalyticsPage.tsx`
- Modify: `apps/desktop/src/features/admin/AdminAnalyticsPage.test.tsx`

- [ ] **Step 1: Write failing shared-component tests**

```tsx
test("supports a non-searchable flat option menu", async () => {
  const user = userEvent.setup();
  render(<ComboboxTest searchable={false} ariaLabel="App filter" />);
  await user.click(screen.getByRole("combobox", { name: "App filter" }));
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Banana" })).toBeInTheDocument();
});

test("remains searchable by default", async () => {
  const user = userEvent.setup();
  render(<ComboboxTest ariaLabel="Fruit picker" />);
  await user.click(screen.getByRole("combobox", { name: "Fruit picker" }));
  expect(screen.getByRole("textbox")).toBeInTheDocument();
});
```

In the Activity card test, assert `querySelector("select")` is null and the `Statistics app` combobox is present.

- [ ] **Step 2: Run and verify RED**

```bash
cd apps/desktop && npm test -- src/components/Combobox.test.tsx src/features/statistics/components/ActivityChartCard.test.tsx
```

Expected: FAIL because `Combobox` has no `searchable` prop and Statistics renders `<select>`.

- [ ] **Step 3: Implement and reuse the shared control**

Add an optional prop with a safe default:

```ts
searchable?: boolean;
```

Destructure `searchable = true`. Only render `.combobox__search` and focus `searchRef` when searchable. Keep Arrow Up/Down, Enter, Escape, selected checkmark, outside click, and focus restoration unchanged.

Replace both native Statistics/Admin `<select>` elements with:

```tsx
<div className="statistics-app-filter">
  <Combobox
    ariaLabel="Statistics app"
    value={selectedApp}
    onChange={setSelectedApp}
    options={appOptions}
    searchable={false}
  />
</div>
```

Use `ariaLabel="Admin statistics app"` for Admin Analytics.

- [ ] **Step 4: Verify shared and consumer tests**

```bash
cd apps/desktop && npm test -- src/components/Combobox.test.tsx src/features/statistics/components/ActivityChartCard.test.tsx src/features/admin/AdminAnalyticsPage.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/Combobox.tsx apps/desktop/src/components/Combobox.test.tsx apps/desktop/src/features/statistics/components/ActivityChartCard.tsx apps/desktop/src/features/statistics/components/ActivityChartCard.test.tsx apps/desktop/src/features/admin/AdminAnalyticsPage.tsx apps/desktop/src/features/admin/AdminAnalyticsPage.test.tsx
git commit -m "feat: use flat shared statistics dropdowns"
```

## Task 5: Build truthful KPI cards and mini sparklines

**Files:**
- Create: `apps/desktop/src/features/statistics/components/MiniSparkline.tsx`
- Create: `apps/desktop/src/features/statistics/components/MiniSparkline.test.tsx`
- Modify: `apps/desktop/src/features/statistics/components/KpiCard.tsx`
- Modify: `apps/desktop/src/features/statistics/components/KpiCard.test.tsx`
- Modify: `apps/desktop/src/features/statistics/pages/StatisticsOverviewPage.tsx`
- Modify: `apps/desktop/src/features/statistics/StatisticsPage.test.tsx`

- [ ] **Step 1: Write failing render and comparison tests**

```tsx
test("renders icon, value, comparison and accessible sparkline", () => {
  render(
    <KpiCard
      icon={<IconClock />}
      label="Active time"
      value="2h 18m"
      comparison={{ kind: "increase", label: "12% vs previous month" }}
      trend={[10, 16, 14, 24]}
    />,
  );
  expect(screen.getByText("Active time")).toBeInTheDocument();
  expect(screen.getByText("12% vs previous month")).toHaveAttribute("data-kind", "increase");
  expect(screen.getByRole("img", { name: "Active time trend" })).toBeInTheDocument();
});

test("formats zero baselines without infinity", () => {
  expect(formatPeriodComparison(0, 0, "month")).toEqual({ kind: "neutral", label: "No change" });
  expect(formatPeriodComparison(60_000, 0, "month")).toEqual({ kind: "increase", label: "New activity" });
});
```

- [ ] **Step 2: Run and verify RED**

```bash
cd apps/desktop && npm test -- src/features/statistics/components/KpiCard.test.tsx src/features/statistics/components/MiniSparkline.test.tsx
```

Expected: FAIL because the new props and sparkline do not exist.

- [ ] **Step 3: Implement focused presentational components**

`MiniSparkline` renders one responsive SVG with `role="img"`, a semantic label, `fill="none"`, and stroke `var(--statistics-accent)`. It accepts only finite numeric points and renders an empty baseline for fewer than two points.

`KpiCard` accepts:

```ts
interface KpiComparison {
  kind: "increase" | "decrease" | "neutral";
  label: string;
}
interface KpiCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  comparison?: KpiComparison;
  trend?: number[];
}
```

Use Tabler `IconClock`, `IconFlame`, and `IconCalendarStats`. Active time and Active days compare against backend previous-period values. Current streak omits comparison text and may show the non-comparative hint `Ending today` only when that statement is true.

- [ ] **Step 4: Verify KPI and overview tests**

```bash
cd apps/desktop && npm test -- src/features/statistics/components/KpiCard.test.tsx src/features/statistics/components/MiniSparkline.test.tsx src/features/statistics/StatisticsPage.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/statistics/components/MiniSparkline.tsx apps/desktop/src/features/statistics/components/MiniSparkline.test.tsx apps/desktop/src/features/statistics/components/KpiCard.tsx apps/desktop/src/features/statistics/components/KpiCard.test.tsx apps/desktop/src/features/statistics/pages/StatisticsOverviewPage.tsx apps/desktop/src/features/statistics/StatisticsPage.test.tsx
git commit -m "feat: polish statistics KPI cards"
```

## Task 6: Replace the contribution grid with the day-by-time heatmap

**Files:**
- Modify: `apps/desktop/src/features/statistics/components/ActivityHeatmap.tsx`
- Modify: `apps/desktop/src/features/statistics/components/ActivityHeatmap.test.tsx`
- Modify: `apps/desktop/src/features/statistics/statistics.css`

- [ ] **Step 1: Write failing grid-meaning tests**

```tsx
test("renders six four-hour rows and seven date columns for Week", () => {
  render(<ActivityHeatmap period={week} buckets={weekBuckets} palette={palette} />);
  expect(screen.getAllByRole("row")).toHaveLength(6);
  expect(screen.getAllByRole("gridcell")).toHaveLength(42);
  expect(screen.getByText("0h")).toBeInTheDocument();
  expect(screen.getByText("24h")).toBeInTheDocument();
});

test("renders one column per date for Month and one per ISO week for Year", () => {
  const { rerender } = render(<ActivityHeatmap period={february2026} buckets={monthBuckets} palette={palette} />);
  expect(screen.getAllByRole("gridcell")).toHaveLength(28 * 6);
  rerender(<ActivityHeatmap period={year2026} buckets={yearBuckets} palette={palette} />);
  expect(screen.getAllByRole("gridcell")).toHaveLength(53 * 6);
});

test("moves focus by time row and period column", async () => {
  const user = userEvent.setup();
  render(<ActivityHeatmap period={week} buckets={weekBuckets} palette={palette} />);
  const cell = screen.getByRole("gridcell", { name: /July 13.*00:00–04:00/ });
  cell.focus();
  await user.keyboard("{ArrowRight}{ArrowDown}");
  expect(screen.getByRole("gridcell", { name: /July 14.*04:00–08:00/ })).toHaveFocus();
});
```

Add tests for app-filtered totals, Year ISO-week aggregation, future cells marked `aria-disabled`, tooltip text, fixed intensity bands, and the visible/screen-reader summaries.

- [ ] **Step 2: Run and verify RED**

```bash
cd apps/desktop && npm test -- src/features/statistics/components/ActivityHeatmap.test.tsx
```

Expected: FAIL because the current heatmap is date-only and horizontally scrollable.

- [ ] **Step 3: Implement pure normalization and the responsive grid**

Change props to:

```ts
interface ActivityHeatmapProps {
  period: StatisticsPeriod;
  buckets: StatisticsTimeBucket[];
  selectedApp: string;
  palette: StatisticsPalette;
}
```

Export and test `buildHeatmapColumns(period, buckets, selectedApp)`. Week/Month columns retain dates. Year columns use ISO week keys and sum all matching days by `bucketStartHour`. Render one `role="grid"` with six row groups and `columns.length * 6` focusable grid cells. Use roving `tabIndex`; left/right changes column and up/down changes one of the six time rows.

Remove `ScrollArea`, `.statistics-heatmap-scroll`, and max-content wrappers from this component. Render sampled X-axis labels and seven Y-boundary labels. Apply density classes `--week`, `--month`, and `--year`; every grid template uses `repeat(var(--column-count), minmax(0, 1fr))`.

- [ ] **Step 4: Verify heatmap and no-horizontal-scroll tests**

```bash
cd apps/desktop && npm test -- src/features/statistics/components/ActivityHeatmap.test.tsx src/styles/tokens.test.ts
```

Expected: PASS. The heatmap component contains no `ScrollArea`, `overflow-x`, or `width: max-content`.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/statistics/components/ActivityHeatmap.tsx apps/desktop/src/features/statistics/components/ActivityHeatmap.test.tsx apps/desktop/src/features/statistics/statistics.css apps/desktop/src/styles/tokens.test.ts
git commit -m "feat: add calendar time activity heatmap"
```

## Task 7: Integrate Activity filters, graph, and saved preferences

**Files:**
- Modify: `apps/desktop/src/features/statistics/components/ActivityChartCard.tsx`
- Modify: `apps/desktop/src/features/statistics/components/ActivityChartCard.test.tsx`
- Modify: `apps/desktop/src/features/statistics/components/ActivityGraph.tsx`
- Modify: `apps/desktop/src/features/statistics/components/ActivityGraph.test.tsx`
- Modify: `apps/desktop/src/features/statistics/preferences.ts`
- Modify: `apps/desktop/src/features/statistics/preferences.test.ts`

- [ ] **Step 1: Write failing state-preservation tests**

```tsx
test("keeps app, view and color while calendar period changes", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<ActivityChartCard period={june} overview={overview} series={series} />);
  await user.click(screen.getByRole("combobox", { name: "Statistics app" }));
  await user.click(screen.getByRole("option", { name: "Reading" }));
  await user.click(screen.getByRole("button", { name: "Graph" }));
  rerender(<ActivityChartCard period={july} overview={overview} series={series} />);
  expect(screen.getByRole("combobox", { name: "Statistics app" })).toHaveTextContent("Reading");
  expect(screen.getByRole("button", { name: "Graph" })).toHaveAttribute("aria-pressed", "true");
});
```

Add a test that Year defaults the graph to weekly and Week/Month default to daily without resetting an explicit user mode that remains valid.

- [ ] **Step 2: Run and verify RED**

```bash
cd apps/desktop && npm test -- src/features/statistics/components/ActivityChartCard.test.tsx src/features/statistics/components/ActivityGraph.test.tsx
```

Expected: FAIL because the component still receives range plus daily-only heatmap data.

- [ ] **Step 3: Integrate normalized period data**

Pass `overview.timeBuckets` to Heatmap and daily `overview.buckets` to Graph. Filter by app inside one memoized selector. Use icon-plus-label segmented buttons with Tabler `IconLayoutGrid` and `IconChartLine`; color, text, border, and selected state remain semantic. The user-selected color is applied only to chart CSS variables.

Update `rangeDefaultGraphMode` to:

```ts
function periodDefaultGraphMode(period: StatisticsPeriod): GraphMode {
  return period.unit === "year" ? "weekly" : "daily";
}
```

Keep preference schema backward-safe: invalid stored views/colors fall back to Heatmap and the current default base color.

- [ ] **Step 4: Verify chart tests**

```bash
cd apps/desktop && npm test -- src/features/statistics/components/ActivityChartCard.test.tsx src/features/statistics/components/ActivityGraph.test.tsx src/features/statistics/preferences.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/statistics/components/ActivityChartCard.tsx apps/desktop/src/features/statistics/components/ActivityChartCard.test.tsx apps/desktop/src/features/statistics/components/ActivityGraph.tsx apps/desktop/src/features/statistics/components/ActivityGraph.test.tsx apps/desktop/src/features/statistics/preferences.ts apps/desktop/src/features/statistics/preferences.test.ts
git commit -m "feat: integrate calendar activity visualizations"
```

## Task 8: Upgrade App insights while preserving registry extensibility

**Files:**
- Modify: `apps/desktop/src/features/statistics/registry.ts`
- Modify: `apps/desktop/src/features/statistics/registry.test.ts`
- Modify: `apps/desktop/src/features/statistics/components/AppInsightCard.tsx`
- Create or modify: `apps/desktop/src/features/statistics/components/AppInsightCard.test.tsx`
- Modify: `apps/desktop/src/features/statistics/pages/StatisticsOverviewPage.tsx`

- [ ] **Step 1: Write failing registry-driven card tests**

```tsx
test("renders registry tagline, metrics, mini trend and detail affordance", () => {
  render(<AppInsightCard app={readingDefinition} summary={readingSummary} state="loaded" onOpen={onOpen} />);
  expect(screen.getByText("Stay curious. Keep reading.")).toBeInTheDocument();
  expect(screen.getByText("Active time")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Reading trend" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open Reading statistics" })).toBeInTheDocument();
});
```

Add a registry test with a third fake app and assert it renders with no overview branch keyed on its name.

- [ ] **Step 2: Run and verify RED**

```bash
cd apps/desktop && npm test -- src/features/statistics/components/AppInsightCard.test.tsx src/features/statistics/registry.test.ts
```

Expected: FAIL because definitions have no tagline and cards have no trend/navigation affordance.

- [ ] **Step 3: Extend the registry contract and card composition**

Add `tagline: string` to `StatisticsAppDefinition`. Reading uses `Stay curious. Keep reading.` and Memora uses `Review. Remember. Grow.`. Keep primary/secondary metric selection in each definition. Reuse `MiniSparkline` and Tabler `IconChevronRight`; do not branch on app keys inside `AppInsightCard`.

Use a semantic `<article>` with a separate icon-only navigation `<button>` instead of nesting a button inside a button. The entire card may become a link-like button only if no child interactive element exists.

- [ ] **Step 4: Verify app-card and overview tests**

```bash
cd apps/desktop && npm test -- src/features/statistics/components/AppInsightCard.test.tsx src/features/statistics/registry.test.ts src/features/statistics/StatisticsPage.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/statistics/registry.ts apps/desktop/src/features/statistics/registry.test.ts apps/desktop/src/features/statistics/components/AppInsightCard.tsx apps/desktop/src/features/statistics/components/AppInsightCard.test.tsx apps/desktop/src/features/statistics/pages/StatisticsOverviewPage.tsx
git commit -m "feat: upgrade registry-driven app insights"
```

## Task 9: Apply the approved token-correct responsive styling

**Files:**
- Modify: `apps/desktop/src/features/statistics/statistics.css`
- Modify: `apps/desktop/src/styles/tokens.css`
- Modify: `apps/desktop/src/styles/tokens.test.ts`
- Modify: `apps/desktop/src/features/statistics/components/StatisticsShell.test.tsx`

- [ ] **Step 1: Write failing CSS source regression tests**

```ts
test("statistics uses flat semantic surfaces without gradients", () => {
  const css = readFileSync(new URL("../features/statistics/statistics.css", import.meta.url), "utf8");
  expect(css).not.toMatch(/linear-gradient|radial-gradient|conic-gradient/);
  expect(css).toContain("background: var(--surface-1)");
  expect(css).toContain("background: var(--surface-2)");
  expect(css).not.toMatch(/overflow-x\s*:\s*(auto|scroll)/);
  expect(css).not.toContain("width: max-content");
});

test("statistics reserves the vertical ScrollArea thumb inset", () => {
  const css = readFileSync(new URL("../features/statistics/statistics.css", import.meta.url), "utf8");
  expect(css).toMatch(/\.statistics-shell__content\s*\{[^}]*padding-right:\s*20px/s);
});
```

Add assertions that card text uses `--text-primary/secondary`, focus uses `--focus-ring`, comparisons use `--success`, and empty heatmap cells use `--surface-3`.

- [ ] **Step 2: Run and verify RED**

```bash
cd apps/desktop && npm test -- src/styles/tokens.test.ts src/features/statistics/components/StatisticsShell.test.tsx
```

Expected: FAIL because old heatmap max-content/scroll rules remain and the approved hierarchy is not styled.

- [ ] **Step 3: Rewrite Statistics CSS around the approved hierarchy**

Use these structural rules as the baseline:

```css
.statistics-shell__content { min-height: 100%; padding: 32px 20px 44px 32px; }
.statistics-kpi-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
.statistics-kpi-card,
.statistics-section { border: 1px solid var(--border-subtle); background: var(--surface-1); box-shadow: var(--shadow-card); }
.statistics-app-card { background: var(--surface-2); }
.statistics-icon-tile,
.statistics-heatmap__cell[data-level="0"] { background: var(--surface-3); }
.statistics-heatmap__plot { display: grid; grid-template-columns: repeat(var(--statistics-column-count), minmax(0, 1fr)); }
.statistics-heatmap--week .statistics-heatmap__plot { gap: 6px; }
.statistics-heatmap--month .statistics-heatmap__plot { gap: 3px; }
.statistics-heatmap--year .statistics-heatmap__plot { gap: 1px; }
```

Style `Combobox` consumers only through width wrappers; do not fork its trigger/panel colors. Segmented controls are solid surfaces with semantic selected state. Add responsive breakpoints for 900px and 720px: KPI and app grids collapse, header controls wrap, and the heatmap retains all columns with reduced gaps/radii.

- [ ] **Step 4: Verify token, scroll, and component tests**

```bash
cd apps/desktop && npm test -- src/styles/tokens.test.ts src/features/statistics/components
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/statistics/statistics.css apps/desktop/src/styles/tokens.css apps/desktop/src/styles/tokens.test.ts apps/desktop/src/features/statistics/components/StatisticsShell.test.tsx
git commit -m "style: refresh statistics dashboard surfaces"
```

## Task 10: Verify the complete desktop code without running the app

**Files:**
- Create: `design-qa.md` only if the Product Design workflow requires a recorded QA status.
- Verify all modified source.

- [ ] **Step 1: Run focused frontend tests**

```bash
cd apps/desktop && npm test -- src/features/statistics src/components/Combobox.test.tsx src/features/admin/AdminAnalyticsPage.test.tsx src/styles/tokens.test.ts src/lib/statistics.test.ts
```

Expected: PASS with no React warnings.

- [ ] **Step 2: Run the complete frontend suite**

```bash
cd apps/desktop && npm test
```

Expected: all tests PASS.

- [ ] **Step 3: Build production frontend assets**

```bash
cd apps/desktop && npm run build
```

Expected: TypeScript and Vite build PASS. Inspect built CSS with:

```bash
rg -n "statistics-period-control|statistics-heatmap--year|statistics-app-card" dist/assets/*.css
```

Expected: all three selectors are present.

- [ ] **Step 4: Run Rust verification from the dependent plan**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo clippy --all-targets --all-features --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings
```

Expected: PASS.

- [ ] **Step 5: Check the worktree diff and forbidden UI patterns**

```bash
git diff --check
rg -n "<select|linear-gradient|radial-gradient|overflow-x:\s*(auto|scroll)|width:\s*max-content" apps/desktop/src/features/statistics apps/desktop/src/features/admin/AdminAnalyticsPage.tsx
```

Expected: no native Statistics/Admin app selector, no Statistics gradient, and no horizontal heatmap scrolling rule. Unrelated pre-existing gradients elsewhere are out of scope.

- [ ] **Step 6: Record the manual-QA boundary without launching Library**

Create `design-qa.md` with:

```markdown
# Statistics Dashboard Design QA

final result: blocked

Automated component tests, token assertions, Rust tests, Clippy, and the production frontend build passed. Fresh WKWebView visual comparison is intentionally not performed because the user explicitly instructed Codex not to run or open the Library/Tauri application. No already-open app or existing Vite process was used as verification evidence.
```

Do not run `npm run dev`, `npm run tauri dev`, `npm run tauri build`, open `Library.app`, stop the user's running app processes, or claim light/dark WKWebView appearance was manually verified.

- [ ] **Step 7: Commit verification metadata if requested by the implementation owner**

```bash
git add design-qa.md
git commit -m "docs: record statistics design QA boundary"
```

If the implementation owner does not want a repository-root QA artifact, leave `design-qa.md` uncommitted and report the blocked runtime check in the final handoff instead.
