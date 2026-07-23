# Statistics Density and Orange Accent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the Statistics dashboard to the approved compact desktop density, remove chart-color customization in favor of the semantic orange token, prevent dense graph-label collisions, and render only one small graph marker during pointer or keyboard interaction.

**Architecture:** Keep the existing Statistics component tree and stylesheet. Preferences will persist only the selected chart view; both heatmap and graph palettes will be derived from `var(--warning)` using the existing theme-aware OKLCH mixes. Graph label sampling becomes a pure helper, while pointer/keyboard state selects one optional marker without changing the memoized line and area paths. CSS changes refine existing reusable Statistics primitives and preserve the `ScrollArea` contract.

**Tech Stack:** React 19, TypeScript, CSS custom properties, Testing Library, Vitest, Vite, Tauri/WKWebView constraints.

---

## Ground rules

- Work from `/Users/jason/project/corelib/.worktrees/statistics`.
- Read and follow:
  - `docs/superpowers/specs/2026-07-23-statistics-density-and-orange-accent-design.md`
  - `.agents/skills/checking-scroll-surfaces/SKILL.md`
- Do not run `npm run dev`, `npm run tauri dev`, `cargo tauri dev`, Library.app, Vite preview, Playwright, or any command that launches the desktop application. The user explicitly forbids runtime launch.
- Do not touch or stage `node_modules/.vite/vitest/**/results.json`.
- Preserve the Year heatmap values exactly: row height `17px`, gap `1px`, radius `2px`.
- Preserve exactly `20px` of right padding on `.statistics-shell__content`.
- Use semantic tokens only. Do not add a raw orange hex value.
- Use `apply_patch` for source edits.
- After every task, inspect `git status --short` and commit only the files named by that task.

## Task 1: Reduce persisted preferences to chart view and derive a fixed orange palette

**Files:**

- Modify: `apps/desktop/src/features/statistics/preferences.test.ts`
- Modify: `apps/desktop/src/features/statistics/preferences.ts`

- [ ] **Step 1: Replace the preference tests with the fixed-accent contract**

Replace color-normalization tests in `preferences.test.ts` with tests covering the complete new public behavior:

```ts
import { afterEach, expect, test, vi } from "vitest";
import {
  deriveStatisticsPalette,
  loadStatisticsPreferences,
  saveStatisticsPreferences,
} from "./preferences";

const store: Record<string, string> = {};

const mockStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => {
    store[key] = value;
  },
  removeItem: (key: string) => {
    delete store[key];
  },
  clear: () => {
    Object.keys(store).forEach((key) => delete store[key]);
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  Object.keys(store).forEach((key) => delete store[key]);
});

test("stores only the selected chart view under the versioned key", () => {
  vi.stubGlobal("localStorage", mockStorage);
  saveStatisticsPreferences({ chartView: "graph" });
  expect(store["library.statistics.preferences.v1"]).toBe(
    JSON.stringify({ chartView: "graph" }),
  );
  expect(loadStatisticsPreferences()).toEqual({ chartView: "graph" });
});

test("loads a chart view from a legacy payload while ignoring its base color", () => {
  vi.stubGlobal("localStorage", {
    ...mockStorage,
    getItem: () =>
      JSON.stringify({ baseColor: "#3778d4", chartView: "graph" }),
  });
  expect(loadStatisticsPreferences()).toEqual({ chartView: "graph" });
});

test("derives five semantic orange tones for dark theme", () => {
  expect(deriveStatisticsPalette("dark")).toEqual([
    "color-mix(in oklch, var(--warning) 28%, var(--surface-1))",
    "color-mix(in oklch, var(--warning) 45%, var(--surface-1))",
    "color-mix(in oklch, var(--warning) 62%, var(--surface-1))",
    "color-mix(in oklch, var(--warning) 79%, var(--surface-1))",
    "color-mix(in oklch, var(--warning) 96%, var(--surface-1))",
  ]);
});

test("derives five semantic orange tones for light theme", () => {
  expect(deriveStatisticsPalette("light")).toEqual([
    "color-mix(in oklch, var(--warning) 18%, var(--surface-1))",
    "color-mix(in oklch, var(--warning) 36%, var(--surface-1))",
    "color-mix(in oklch, var(--warning) 55%, var(--surface-1))",
    "color-mix(in oklch, var(--warning) 76%, var(--surface-1))",
    "color-mix(in oklch, var(--warning) 96%, var(--surface-1))",
  ]);
});

test("returns the heatmap default for missing, malformed, or invalid data", () => {
  vi.stubGlobal("localStorage", mockStorage);
  expect(loadStatisticsPreferences()).toEqual({ chartView: "heatmap" });

  store["library.statistics.preferences.v1"] = "not-json";
  expect(loadStatisticsPreferences()).toEqual({ chartView: "heatmap" });

  store["library.statistics.preferences.v1"] = JSON.stringify({
    chartView: "radar",
  });
  expect(loadStatisticsPreferences()).toEqual({ chartView: "heatmap" });
});

test("handles storage read and write errors without breaking Statistics", () => {
  vi.stubGlobal("localStorage", {
    ...mockStorage,
    getItem: () => {
      throw new Error("storage unavailable");
    },
    setItem: () => {
      throw new Error("storage unavailable");
    },
  });
  expect(loadStatisticsPreferences()).toEqual({ chartView: "heatmap" });
  expect(() =>
    saveStatisticsPreferences({ chartView: "graph" }),
  ).not.toThrow();
});
```

- [ ] **Step 2: Run the preference test and confirm it fails for the removed contract**

Run:

```bash
cd apps/desktop
npm test -- src/features/statistics/preferences.test.ts
```

Expected: FAIL because `StatisticsPreferences` still requires `baseColor` and `deriveStatisticsPalette` still accepts two arguments.

- [ ] **Step 3: Replace `preferences.ts` with the minimal view-only implementation**

Keep the storage key unchanged so existing installations migrate in place:

```ts
const STORAGE_KEY = "library.statistics.preferences.v1";

const LIGHT_MIX = [18, 36, 55, 76, 96] as const;
const DARK_MIX = [28, 45, 62, 79, 96] as const;

export type StatisticsChartView = "heatmap" | "graph";

export interface StatisticsPreferences {
  chartView: StatisticsChartView;
}

const DEFAULT_PREFERENCES: StatisticsPreferences = {
  chartView: "heatmap",
};

function isChartView(value: unknown): value is StatisticsChartView {
  return value === "heatmap" || value === "graph";
}

export function loadStatisticsPreferences(): StatisticsPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;

    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "chartView" in parsed &&
      isChartView(parsed.chartView)
    ) {
      return { chartView: parsed.chartView };
    }
  } catch {
    // Invalid or unavailable storage falls through to safe defaults.
  }
  return DEFAULT_PREFERENCES;
}

export function saveStatisticsPreferences(
  value: StatisticsPreferences,
): void {
  try {
    const chartView = isChartView(value.chartView)
      ? value.chartView
      : DEFAULT_PREFERENCES.chartView;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ chartView }));
  } catch {
    // Storage errors never break Statistics.
  }
}

export function deriveStatisticsPalette(
  theme: "light" | "dark",
): string[] {
  const mix = theme === "light" ? LIGHT_MIX : DARK_MIX;
  return mix.map(
    (percent) =>
      `color-mix(in oklch, var(--warning) ${percent}%, var(--surface-1))`,
  );
}
```

- [ ] **Step 4: Run the preference tests again**

Run:

```bash
npm test -- src/features/statistics/preferences.test.ts
```

Expected: PASS.

- [ ] **Step 5: Confirm no production caller still expects the old signature before committing**

Run:

```bash
rg -n "baseColor|deriveStatisticsPalette\\(" src/features/statistics
git diff --check
git status --short
```

Expected at this intermediate point: old callers/tests are still listed and will be removed in Task 2; no whitespace errors.

- [ ] **Step 6: Keep Task 1 uncommitted until its callers are migrated**

```bash
git status --short
```

Expected: only the two preference files from this task, plus the pre-existing
ignored cache result, are modified. Do not create a commit that leaves
`ActivityChartCard.tsx` calling the old function signature. Task 2 completes
and commits this atomic refactor.

## Task 2: Remove the color picker and wire Activity to the fixed palette

**Files:**

- Modify: `apps/desktop/src/features/statistics/components/ActivityChartCard.test.tsx`
- Modify: `apps/desktop/src/features/statistics/components/ActivityChartCard.tsx`
- Delete: `apps/desktop/src/features/statistics/components/StatisticsColorPicker.tsx`
- Delete: `apps/desktop/src/features/statistics/components/StatisticsColorPicker.test.tsx`

- [ ] **Step 1: Update the Activity card tests to prohibit color customization**

Make these exact test changes:

1. Keep the legacy saved-payload test unchanged. It proves a stored `baseColor` does not stop the saved graph view from loading.
2. Rename:

```ts
test("keeps app, view, and an explicit graph mode while the calendar period changes", async () => {
```

3. Remove both the click and final assertion for `Set chart color to #e84c3d`.
4. Add:

```ts
test("does not expose chart color customization", () => {
  render(
    <ActivityChartCard
      period={{ unit: "month", anchorLocalDay: "2026-07-01" }}
      totalBuckets={[]}
      timeBuckets={[]}
      series={[]}
    />,
  );

  expect(screen.queryByText("Chart color")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /set chart color/i }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText("Custom chart color"),
  ).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the Activity card test and confirm the new absence test fails**

Run:

```bash
npm test -- src/features/statistics/components/ActivityChartCard.test.tsx
```

Expected: FAIL because the color-picker controls still render.

- [ ] **Step 3: Remove color state and the picker from `ActivityChartCard.tsx`**

Apply all of the following as one coherent edit:

- Remove the `StatisticsColorPicker` import.
- Remove `baseColor` state.
- Keep the theme state and `MutationObserver`; light and dark palettes use different mix percentages.
- Save only the view:

```ts
const handleViewChange = useCallback(
  (newView: "heatmap" | "graph") => {
    setView(newView);
    saveStatisticsPreferences({ chartView: newView });
  },
  [],
);
```

- Remove `handleColorChange`.
- Derive the palette only from the theme:

```ts
const palette = useMemo(
  () => deriveStatisticsPalette(theme),
  [theme],
);
```

- Remove the final `StatisticsColorPicker` JSX element from the section.

- [ ] **Step 4: Delete the obsolete component and its dedicated test**

Use `apply_patch` with `*** Delete File` hunks to delete:

- `apps/desktop/src/features/statistics/components/StatisticsColorPicker.tsx`
- `apps/desktop/src/features/statistics/components/StatisticsColorPicker.test.tsx`

Do not delete shared `.sr-only` CSS; Task 4 uses it for the graph's accessible data list.

- [ ] **Step 5: Run the focused tests**

Run:

```bash
npm test -- \
  src/features/statistics/preferences.test.ts \
  src/features/statistics/components/ActivityChartCard.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Scan for the removed API and commit**

Run:

```bash
rg -n "StatisticsColorPicker|baseColor|Chart color|Custom chart color|Set chart color" \
  src/features/statistics --glob '!*.test.ts' --glob '!*.test.tsx'
git diff --check
git status --short
```

Expected: no production matches. The Activity card test intentionally retains
one legacy payload containing `baseColor` to prove migration behavior.

Commit:

```bash
git add \
  apps/desktop/src/features/statistics/preferences.ts \
  apps/desktop/src/features/statistics/preferences.test.ts \
  apps/desktop/src/features/statistics/components/ActivityChartCard.tsx \
  apps/desktop/src/features/statistics/components/ActivityChartCard.test.tsx \
  apps/desktop/src/features/statistics/components/StatisticsColorPicker.tsx \
  apps/desktop/src/features/statistics/components/StatisticsColorPicker.test.tsx
git commit -m "refactor: use fixed statistics accent"
```

## Task 3: Make dense graph labels compact and deterministic

**Files:**

- Modify: `apps/desktop/src/features/statistics/components/ActivityGraph.test.tsx`
- Modify: `apps/desktop/src/features/statistics/components/ActivityGraph.tsx`

- [ ] **Step 1: Add pure-helper tests for dense Weekly data**

Update the import:

```ts
import {
  ActivityGraph,
  aggregateWeekly,
  cumulativeSum,
  graphAxisLabels,
  type ActivityBucket,
} from "./ActivityGraph";
```

Replace the existing `renders Week-of label in weekly mode` test with:

```ts
test("samples at most six compact weekly labels including both endpoints", () => {
  const dateFromOffset = (days: number): string => {
    const date = new Date(2025, 11, 29);
    date.setDate(date.getDate() + days);
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  };
  const weeklyBuckets: ActivityBucket[] = Array.from(
    { length: 53 },
    (_, index) => ({
      date: dateFromOffset(index * 7),
      value: index,
    }),
  );

  const labels = graphAxisLabels(weeklyBuckets, "weekly");

  expect(labels.map(({ idx }) => idx)).toEqual([0, 10, 21, 31, 42, 52]);
  expect(labels[0].label).toBe("Dec 29");
  expect(labels.at(-1)?.label).not.toMatch(/Week of/);
});

test("allows at most seven labels for daily and cumulative modes", () => {
  expect(graphAxisLabels(dailyBuckets, "daily")).toHaveLength(7);
  expect(graphAxisLabels(dailyBuckets, "cumulative")).toHaveLength(7);
});

test("handles empty and single-point axis data", () => {
  expect(graphAxisLabels([], "weekly")).toEqual([]);
  expect(
    graphAxisLabels([{ date: "2026-07-23", value: 2 }], "weekly"),
  ).toEqual([{ idx: 0, label: "Jul 23" }]);
});
```

- [ ] **Step 2: Run the graph test and confirm the helper import fails**

Run:

```bash
npm test -- src/features/statistics/components/ActivityGraph.test.tsx
```

Expected: FAIL because `graphAxisLabels` is not exported.

- [ ] **Step 3: Add the pure label helper to `ActivityGraph.tsx`**

Place this immediately after `formatShortDate`:

```ts
export interface GraphAxisLabel {
  idx: number;
  label: string;
}

export function graphAxisLabels(
  data: ActivityBucket[],
  mode: GraphMode,
): GraphAxisLabel[] {
  if (data.length === 0) return [];
  if (data.length === 1) {
    return [{ idx: 0, label: formatShortDate(data[0].date) }];
  }

  const maxLabels = Math.min(
    data.length,
    mode === "weekly" ? 6 : 7,
  );
  const indices = Array.from({ length: maxLabels }, (_, index) =>
    Math.round((index * (data.length - 1)) / (maxLabels - 1)),
  );

  return Array.from(new Set(indices)).map((idx) => ({
    idx,
    label: formatShortDate(data[idx].date),
  }));
}
```

Replace the existing `xLabels` calculation with:

```ts
const xLabels = useMemo(
  () => graphAxisLabels(data, mode),
  [data, mode],
);
```

Do not put `Week of` back into visible SVG axis text. Add one point-description
helper inside the component and use it for pointer tooltips, keyboard tooltips,
and the accessible data list:

```ts
const describePoint = useCallback(
  (bucket: ActivityBucket) => {
    const date =
      mode === "weekly" ? `Week of ${bucket.date}` : bucket.date;
    return `${date}: ${bucket.value} ${valueLabel}`;
  },
  [mode, valueLabel],
);
```

Replace every duplicated
`` `${data[index].date}: ${data[index].value} ${valueLabel}` ``
expression with `describePoint(data[index])`. Add `describePoint` to the
relevant callback dependency arrays. This keeps Weekly meaning explicit in
tooltips and screen-reader text while the visible axis stays compact.

- [ ] **Step 4: Run graph tests**

```bash
npm test -- src/features/statistics/components/ActivityGraph.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git diff --check
git add \
  apps/desktop/src/features/statistics/components/ActivityGraph.tsx \
  apps/desktop/src/features/statistics/components/ActivityGraph.test.tsx
git commit -m "fix: compact statistics graph labels"
```

## Task 4: Render only one radius-three graph marker during interaction

**Files:**

- Modify: `apps/desktop/src/features/statistics/components/ActivityGraph.test.tsx`
- Modify: `apps/desktop/src/features/statistics/components/ActivityGraph.tsx`
- Verify: `apps/desktop/src/features/statistics/components/ActivityChartCard.test.tsx`

- [ ] **Step 1: Add marker behavior tests**

Change the test imports to include `fireEvent`. Add deterministic buckets:

```ts
const markerBuckets: ActivityBucket[] = [
  { date: "2026-07-21", value: 0 },
  { date: "2026-07-22", value: 2 },
  { date: "2026-07-23", value: 1 },
];
```

Add these tests:

```ts
test("renders no persistent point markers at rest", () => {
  const { container } = render(
    <ActivityGraph
      buckets={markerBuckets}
      mode="daily"
      onModeChange={vi.fn()}
      valueLabel="Active time"
    />,
  );

  expect(
    screen.queryByTestId("activity-graph-marker"),
  ).not.toBeInTheDocument();
  expect(container.querySelectorAll("circle")).toHaveLength(0);
});

test("shows one radius-three marker at the nearest point while hovering", () => {
  render(
    <ActivityGraph
      buckets={markerBuckets}
      mode="daily"
      onModeChange={vi.fn()}
      valueLabel="Active time"
    />,
  );

  const svg = screen.getByRole("img");
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 600,
    bottom: 200,
    width: 600,
    height: 200,
    toJSON: () => ({}),
  });
  vi.spyOn(
    screen.getByTestId("activity-graph"),
    "getBoundingClientRect",
  ).mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 600,
    bottom: 200,
    width: 600,
    height: 200,
    toJSON: () => ({}),
  });

  fireEvent.mouseMove(svg, { clientX: 300, clientY: 80 });

  const marker = screen.getByTestId("activity-graph-marker");
  expect(marker).toHaveAttribute("r", "3");
  expect(document.querySelectorAll(
    '[data-testid="activity-graph-marker"]',
  )).toHaveLength(1);

  fireEvent.mouseLeave(svg);
  expect(
    screen.queryByTestId("activity-graph-marker"),
  ).not.toBeInTheDocument();
});

test("shows one marker during keyboard navigation and removes it on blur", () => {
  render(
    <ActivityGraph
      buckets={markerBuckets}
      mode="daily"
      onModeChange={vi.fn()}
      valueLabel="Active time"
    />,
  );

  const svg = screen.getByRole("img");
  fireEvent.focus(svg);
  expect(screen.getByTestId("activity-graph-marker")).toHaveAttribute(
    "r",
    "3",
  );
  expect(screen.getByText(
    "2026-07-21: 0 Active time",
    { selector: ".statistics-graph__tooltip" },
  )).toBeInTheDocument();

  fireEvent.keyDown(svg, { key: "ArrowRight" });
  expect(document.querySelectorAll(
    '[data-testid="activity-graph-marker"]',
  )).toHaveLength(1);
  expect(screen.getByText(
    "2026-07-22: 2 Active time",
    { selector: ".statistics-graph__tooltip" },
  )).toBeInTheDocument();

  fireEvent.keyDown(svg, { key: "End" });
  expect(screen.getByText(
    "2026-07-23: 1 Active time",
    { selector: ".statistics-graph__tooltip" },
  )).toBeInTheDocument();

  fireEvent.blur(svg);
  expect(
    screen.queryByTestId("activity-graph-marker"),
  ).not.toBeInTheDocument();
});

test("keeps weekly meaning in tooltip text without lengthening axis labels", () => {
  render(
    <ActivityGraph
      buckets={[
        { date: "2026-07-20", value: 2 },
        { date: "2026-07-27", value: 1 },
      ]}
      mode="weekly"
      onModeChange={vi.fn()}
      valueLabel="Active time"
    />,
  );

  const svg = screen.getByRole("img");
  fireEvent.focus(svg);
  expect(screen.getByText(
    "Week of 2026-07-20: 2 Active time",
    { selector: ".statistics-graph__tooltip" },
  )).toBeInTheDocument();
  expect(screen.queryByText(/Week of Jul/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the graph test and confirm it fails**

```bash
npm test -- src/features/statistics/components/ActivityGraph.test.tsx
```

Expected: FAIL because every data point currently renders a circle and the first point is active at rest.

- [ ] **Step 3: Replace per-point focus state with one optional active marker**

In `ActivityGraph.tsx`:

1. Add keyboard activation state:

```ts
const [keyboardActive, setKeyboardActive] = useState(false);
```

2. Compute the only active marker:

```ts
const activeIdx =
  hoveredIdx ?? (keyboardActive ? focusedIdx : null);
```

3. Add a helper that positions the keyboard tooltip from graph coordinates:

```ts
const showKeyboardTooltip = useCallback(
  (idx: number) => {
    const containerRect =
      containerRef.current?.getBoundingClientRect();
    if (!containerRect || !data[idx]) return;
    setTooltip({
      x: (xScale(idx) / VB_W) * containerRect.width,
      y:
        (yScale(data[idx].value) / VB_H) *
          containerRect.height -
        30,
      content:
        `${data[idx].date}: ${data[idx].value} ${valueLabel}`,
    });
  },
  [data, valueLabel, xScale, yScale],
);
```

4. In `handleKeyDown`, return immediately when `n === 0`, then call `showKeyboardTooltip(next)` after setting the new index. Remove the duplicated tooltip-coordinate code from that handler.
5. Add SVG focus handlers:

```ts
const handleFocus = useCallback(() => {
  if (n === 0) return;
  const next = Math.min(focusedIdx, n - 1);
  setFocusedIdx(next);
  setKeyboardActive(true);
  showKeyboardTooltip(next);
}, [focusedIdx, n, showKeyboardTooltip]);

const handleBlur = useCallback(() => {
  setKeyboardActive(false);
  setTooltip(null);
}, []);
```

6. Preserve keyboard access when pointer interaction ends:

```ts
const handleMouseLeave = useCallback(() => {
  setHoveredIdx(null);
  if (keyboardActive && data[focusedIdx]) {
    showKeyboardTooltip(focusedIdx);
    return;
  }
  setTooltip(null);
}, [
  data,
  focusedIdx,
  keyboardActive,
  showKeyboardTooltip,
]);
```

7. Add `onFocus={handleFocus}` and `onBlur={handleBlur}` to the SVG.
8. Delete `handlePointFocus` and `handlePointBlur`.
9. Delete the entire block that maps `data` into one `<circle>` per bucket.
10. Render one non-focusable marker after the line path:

```tsx
{activeIdx !== null && data[activeIdx] ? (
  <circle
    data-testid="activity-graph-marker"
    cx={xScale(activeIdx)}
    cy={yScale(data[activeIdx].value)}
    r={3}
    fill="var(--chart-line, currentColor)"
    aria-hidden="true"
  />
) : null}
```

The marker is presentation-only. The SVG remains the single keyboard focus target.

- [ ] **Step 4: Preserve screen-reader access to every plotted value**

The removed circles previously carried an `aria-label` for every value. Add this directly after the closing `</svg>` and before the tooltip:

```tsx
<ul className="sr-only" aria-label={`${valueLabel} data`}>
  {data.map((bucket) => (
    <li
      key={bucket.date}
      aria-label={describePoint(bucket)}
    >
      {describePoint(bucket)}
    </li>
  ))}
</ul>
```

This keeps existing detail/filter tests that query the date/value aria-labels
valid without restoring visible SVG points.

- [ ] **Step 5: Run graph and Activity card tests**

```bash
npm test -- \
  src/features/statistics/components/ActivityGraph.test.tsx \
  src/features/statistics/components/ActivityChartCard.test.tsx
```

Expected: PASS. The Activity card tests prove filtered graph values remain accessible.

- [ ] **Step 6: Commit Task 4**

```bash
git diff --check
git add \
  apps/desktop/src/features/statistics/components/ActivityGraph.tsx \
  apps/desktop/src/features/statistics/components/ActivityGraph.test.tsx
git commit -m "refine: show graph markers on interaction"
```

## Task 5: Apply the approved A-density CSS and semantic orange accent

**Files:**

- Modify: `apps/desktop/src/styles/tokens.test.ts`
- Modify: `apps/desktop/src/features/statistics/statistics.css`

- [ ] **Step 1: Extend CSS regression tests with the approved measurements**

In `uses semantic tokens in Statistics CSS with proper scroll-surface padding`, replace the old padding assertion and add the semantic accent assertion:

```ts
expect(shellContent).toContain("padding: 28px 20px 38px 28px;");
expect(statCss).toContain("--statistics-accent: var(--warning);");
```

In `keeps the statistics dashboard flat, responsive, and token-correct`, extract these blocks:

```ts
const kpiCard = statCss.match(
  /\.statistics-kpi-card\s*\{([^}]*)\}/,
)?.[1] ?? "";
const section = statCss.match(
  /\.statistics-section\s*\{([^}]*)\}/,
)?.[1] ?? "";
const appCard = statCss.match(
  /\.statistics-app-card\s*\{([^}]*)\}/,
)?.[1] ?? "";
const yearHeatmap = statCss.match(
  /\.statistics-heatmap-wrapper--year\s*\{([^}]*)\}/,
)?.[1] ?? "";
```

Add:

```ts
expect(kpiCard).toContain("min-height: 156px;");
expect(section).toContain("padding: 22px;");
expect(section).toContain("border-radius: 16px;");
expect(appCard).toContain("padding: 20px;");
expect(appCard).toContain("border-radius: 14px;");
expect(yearHeatmap).toContain("--heatmap-gap: 1px;");
expect(yearHeatmap).toContain("--heatmap-row-height: 17px;");
expect(statCss).not.toContain(".statistics-color-picker");
```

Keep all existing flat-layout, semantic-token, breakpoint, and no-horizontal-scroll assertions.

- [ ] **Step 2: Run token tests and confirm the new measurements fail**

```bash
npm test -- src/styles/tokens.test.ts
```

Expected: FAIL against the current larger values and blue `--statistics-accent`.

- [ ] **Step 3: Apply the exact desktop density values in `statistics.css`**

Change only the existing primitives:

```css
.statistics-shell {
  --statistics-accent: var(--warning);
}

.statistics-shell__content {
  padding: 28px 20px 38px 28px;
}

.statistics-shell__header {
  gap: 20px;
  margin-bottom: 24px;
}

.statistics-shell__heading h1 {
  font-size: clamp(28px, 2.7vw, 36px);
}

.statistics-card {
  padding: 18px;
  border-radius: 14px;
}

.statistics-card__label {
  font-size: 13px;
}

.statistics-card__value {
  font-size: clamp(26px, 2.4vw, 32px);
}

.statistics-kpi-grid {
  gap: 16px;
}

.statistics-kpi-card {
  min-height: 156px;
}

.statistics-kpi-card__icon,
.statistics-icon-tile {
  width: 38px;
  height: 38px;
}

.statistics-kpi-card__icon svg {
  width: 19px;
  height: 19px;
}

.statistics-mini-sparkline {
  width: min(108px, 42%);
  height: 36px;
  flex-basis: 108px;
}

.statistics-control {
  min-height: 34px;
  padding: 6px 10px;
  font-size: 13px;
}

.statistics-section {
  padding: 22px;
  border-radius: 16px;
}

.statistics-section + .statistics-section,
.statistics-kpi-grid + .statistics-section {
  margin-top: 18px;
}

.statistics-section__header {
  margin-bottom: 16px;
}

.statistics-section__title {
  font-size: 20px;
}

.statistics-app-grid {
  gap: 16px;
}

.statistics-app-card {
  gap: 18px 16px;
  padding: 20px;
  border-radius: 14px;
}

.statistics-app-card__icon {
  width: 40px;
  height: 40px;
}

.statistics-app-card__heading h3 {
  font-size: 18px;
}

.statistics-app-card__metrics strong {
  font-size: 25px;
}

.statistics-app-card .statistics-mini-sparkline {
  width: 92px;
  height: 36px;
}

.statistics-chart-card__controls {
  margin-bottom: 16px;
}

.statistics-heatmap__x-axis {
  margin-bottom: 6px;
}

.statistics-heatmap__tooltip {
  margin-top: 10px;
}

.statistics-heatmap__summary {
  margin-top: 10px;
}
```

Preserve every property not explicitly replaced above, including colors, borders, shadows, grid structure, and max width.

- [ ] **Step 4: Remove the entire obsolete color-picker CSS block**

Delete every rule whose selector begins with
`.statistics-color-picker`, from the root rail through the custom input rule.

Keep `.sr-only`.

- [ ] **Step 5: Apply the responsive exceptions exactly**

Inside `@media (max-width: 900px)`:

```css
.statistics-shell__content {
  padding: 26px 20px 36px 24px;
}

.statistics-kpi-card {
  min-height: 146px;
}

.statistics-section {
  padding: 20px;
}
```

The global `.statistics-card` already supplies `18px` padding and `14px` radius.

Inside `@media (max-width: 720px)`:

```css
.statistics-control {
  min-height: 36px;
}

.statistics-kpi-card {
  min-height: 148px;
}

.statistics-section {
  padding: 18px;
}
```

Keep the mobile content right padding at `20px`. Keep all current grid-collapse and heatmap responsive rules.

- [ ] **Step 6: Run CSS, sparkline, and scroll-surface tests**

```bash
npm test -- \
  src/styles/tokens.test.ts \
  src/features/statistics/components/MiniSparkline.test.tsx \
  src/components/ScrollArea.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Run semantic and scrollbar scans**

```bash
rg -n "statistics-color-picker|linear-gradient|radial-gradient|conic-gradient|overflow-x\\s*:\\s*(auto|scroll)|width:\\s*max-content|#[0-9a-fA-F]{3,8}\\b" \
  src/features/statistics
rg -n -- "--statistics-accent|--statistics-level-[1-5]|--heatmap-row-height|--heatmap-gap" \
  src/features/statistics/statistics.css
git diff --check
```

Expected:

- First command has no matches.
- Second command shows `--statistics-accent: var(--warning)`, the palette level variables, and unchanged Year `17px` / `1px`.

- [ ] **Step 8: Commit Task 5**

```bash
git add \
  apps/desktop/src/features/statistics/statistics.css \
  apps/desktop/src/styles/tokens.test.ts
git commit -m "refine: tighten statistics dashboard density"
```

## Task 6: Run full CLI verification and document the runtime limitation

**Files:**

- Modify: `apps/desktop/design-qa.md`

- [ ] **Step 1: Record exact source state before verification**

From the worktree root:

```bash
git rev-parse --short HEAD
git status --short
pgrep -afil "tauri dev|vite|library_desktop|Library.app" || true
```

Do not stop, restart, or reuse any reported application process. Record only that no fresh runtime was launched from this checkout.

- [ ] **Step 2: Run focused Statistics verification**

```bash
cd apps/desktop
npm test -- \
  src/features/statistics \
  src/components/ScrollArea.test.tsx \
  src/styles/tokens.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run the complete frontend test suite**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Build the production frontend without launching it**

```bash
npm run build
```

Expected: PASS. This is a Vite production build only; do not run preview and do not claim it proves WKWebView rendering.

- [ ] **Step 5: Run final repository checks**

From the worktree root:

```bash
git diff --check
rg -n "StatisticsColorPicker|statistics-color-picker|baseColor|Chart color|Custom chart color|Set chart color" \
  apps/desktop/src/features/statistics \
  --glob '!*.test.ts' --glob '!*.test.tsx'
rg -n "<select|linear-gradient|radial-gradient|conic-gradient|overflow-x\\s*:\\s*(auto|scroll)|width:\\s*max-content" \
  apps/desktop/src/features/statistics
git status --short
```

Expected: both scans return no matches. `node_modules/.vite/vitest/**/results.json` may remain dirty and must not be staged.

- [ ] **Step 6: Update `design-qa.md` truthfully**

Add a dated CLI-verification entry containing:

- tested commit from Step 1;
- exact focused test, full test, and build results;
- statement that no new `tauri dev`, Vite runtime, release app, or Library.app was launched;
- statement that light/dark visual token fidelity, actual WKWebView scroll behavior, and screenshot comparison remain unverified;
- `final result: blocked`.

Do not change the result to pass until the user permits a fresh runtime launch and the exact current checkout is visually inspected.

- [ ] **Step 7: Commit the verification record**

```bash
git add apps/desktop/design-qa.md
git commit -m "docs: record statistics cli verification"
```

- [ ] **Step 8: Final self-review**

Run:

```bash
git log --oneline -8
git status --short
git diff d711b3c..HEAD --stat
```

Review the implementation against every acceptance criterion in:

`docs/superpowers/specs/2026-07-23-statistics-density-and-orange-accent-design.md`

Confirm explicitly:

- desktop A-density values match the table;
- right scroll gutter is still `20px`;
- Year heatmap remains `17px` / `1px` / `2px`;
- chart color UI and persisted `baseColor` are gone;
- all chart accents derive from `var(--warning)`;
- Weekly labels are compact and capped at six;
- zero graph circles render at rest;
- exactly one radius-three marker renders on hover or keyboard focus;
- no application runtime was launched.
