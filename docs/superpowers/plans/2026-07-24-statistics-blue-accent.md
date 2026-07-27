# Statistics Blue Accent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Statistics orange visualization accent with the approved reference blue across Heatmap, Activity Graph, markers, KPI sparklines, and App-insight sparklines.

**Architecture:** Keep one Statistics-scoped CSS custom property as the source of truth. The shell supplies a contrast-safe blue per theme, Heatmap and Activity Graph derive five sRGB tones from that property, and existing mini sparklines continue consuming the strongest property directly.

**Tech Stack:** React 19, TypeScript, CSS custom properties, SVG, Vitest, Testing Library, Vite.

---

## File map

- `apps/desktop/src/features/statistics/statistics.css`
  owns the light and dark values of `--statistics-accent`.
- `apps/desktop/src/features/statistics/preferences.ts`
  derives the five shared Heatmap and Activity Graph tones.
- `apps/desktop/src/features/statistics/preferences.test.ts`
  locks the palette source, percentages, and sRGB color space.
- `apps/desktop/src/styles/tokens.test.ts`
  locks the theme-scoped blue token and the mini-sparkline consumer.
- `apps/desktop/src/features/statistics/components/MiniSparkline.tsx`
  is a verified consumer only; production changes are not expected.
- `design-qa.md`
  records fresh CLI evidence and the intentionally blocked runtime comparison.

### Task 1: Establish the blue token and shared palette

**Files:**

- Modify: `apps/desktop/src/features/statistics/preferences.test.ts`
- Modify: `apps/desktop/src/styles/tokens.test.ts`
- Modify: `apps/desktop/src/features/statistics/preferences.ts`
- Modify: `apps/desktop/src/features/statistics/statistics.css`
- Verify: `apps/desktop/src/features/statistics/components/MiniSparkline.test.tsx`

- [ ] **Step 1: Write the failing palette tests**

Replace the two palette assertions in
`apps/desktop/src/features/statistics/preferences.test.ts` with:

```ts
test("derives five Statistics blue mixes for dark theme", () => {
  const palette = deriveStatisticsPalette("dark");
  expect(palette).toEqual([
    "color-mix(in srgb, var(--statistics-accent) 28%, var(--surface-1))",
    "color-mix(in srgb, var(--statistics-accent) 45%, var(--surface-1))",
    "color-mix(in srgb, var(--statistics-accent) 62%, var(--surface-1))",
    "color-mix(in srgb, var(--statistics-accent) 79%, var(--surface-1))",
    "color-mix(in srgb, var(--statistics-accent) 100%, var(--surface-1))",
  ]);
  expect(palette.every((color) => !color.includes("var(--warning)"))).toBe(true);
  expect(palette.every((color) => !color.includes("in oklch"))).toBe(true);
});

test("derives five Statistics blue mixes for light theme", () => {
  const palette = deriveStatisticsPalette("light");
  expect(palette).toEqual([
    "color-mix(in srgb, var(--statistics-accent) 18%, var(--surface-1))",
    "color-mix(in srgb, var(--statistics-accent) 36%, var(--surface-1))",
    "color-mix(in srgb, var(--statistics-accent) 55%, var(--surface-1))",
    "color-mix(in srgb, var(--statistics-accent) 76%, var(--surface-1))",
    "color-mix(in srgb, var(--statistics-accent) 100%, var(--surface-1))",
  ]);
  expect(palette.every((color) => !color.includes("var(--warning)"))).toBe(true);
  expect(palette.every((color) => !color.includes("in oklch"))).toBe(true);
});
```

- [ ] **Step 2: Write the failing theme-token test**

Replace the existing Statistics warning-token test in
`apps/desktop/src/styles/tokens.test.ts` with:

```ts
test("defines a theme-aware blue Statistics accent for every visualization", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const statisticsCss = readFileSync(
    join(currentDir, "../features/statistics/statistics.css"),
    "utf8",
  );
  const sparkline = readFileSync(
    join(currentDir, "../features/statistics/components/MiniSparkline.tsx"),
    "utf8",
  );

  expect(statisticsCss).toMatch(
    /\.statistics-shell\s*\{[\s\S]*?--statistics-accent:\s*#456079;/,
  );
  expect(statisticsCss).toMatch(
    /\[data-theme="dark"\]\s+\.statistics-shell\s*\{[\s\S]*?--statistics-accent:\s*#83c3ff;/,
  );
  expect(statisticsCss).not.toContain("--statistics-accent: var(--warning);");
  expect(sparkline).toContain('stroke="var(--statistics-accent)"');
});
```

In the density regression assertion in the same test file, replace:

```ts
expect(desktopCss).toContain("--statistics-accent: var(--warning);");
```

with:

```ts
expect(desktopCss).toContain("--statistics-accent: #456079;");
expect(desktopCss).toContain(
  '[data-theme="dark"] .statistics-shell {\n  --statistics-accent: #83c3ff;\n}',
);
```

- [ ] **Step 3: Run the tests to verify the new contract fails**

Run from `apps/desktop`:

```bash
npm test -- src/features/statistics/preferences.test.ts src/styles/tokens.test.ts
```

Expected: FAIL because production still uses `var(--warning)`, the highest
mix is still `96%`, and no dark Statistics override exists.

- [ ] **Step 4: Implement the dedicated theme token**

At the top of `apps/desktop/src/features/statistics/statistics.css`, replace
the warning alias and add the dark override:

```css
.statistics-shell {
  height: 100%;
  --statistics-accent: #456079;
  background: var(--main-bg);
  color: var(--text-primary);
}

[data-theme="dark"] .statistics-shell {
  --statistics-accent: #83c3ff;
}
```

Do not modify global `--link`, `--warning`, or other app-wide tokens.

- [ ] **Step 5: Implement the shared five-tone palette**

In `apps/desktop/src/features/statistics/preferences.ts`, use:

```ts
const LIGHT_MIX = [18, 36, 55, 76, 100] as const;
const DARK_MIX = [28, 45, 62, 79, 100] as const;
```

Then replace `deriveStatisticsPalette` with:

```ts
export function deriveStatisticsPalette(theme: "light" | "dark"): string[] {
  const mix = theme === "light" ? LIGHT_MIX : DARK_MIX;
  return mix.map(
    (pct) =>
      `color-mix(in srgb, var(--statistics-accent) ${pct}%, var(--surface-1))`,
  );
}
```

Do not change `ActivityHeatmap`, `ActivityGraph`, or `MiniSparkline`: their
existing palette and token contracts already route the shared accent to every
required visualization.

- [ ] **Step 6: Run focused tests to verify the blue contract passes**

Run from `apps/desktop`:

```bash
npm test -- src/features/statistics/preferences.test.ts src/styles/tokens.test.ts src/features/statistics/components/MiniSparkline.test.tsx src/features/statistics/components/ActivityHeatmap.test.tsx src/features/statistics/components/ActivityGraph.test.tsx
```

Expected: all selected files and tests PASS.

- [ ] **Step 7: Scan production Statistics code for stale orange dependencies**

Run from the repository root:

```bash
rg -n --glob '!*.test.ts' --glob '!*.test.tsx' 'statistics-accent:\s*var\(--warning\)|color-mix\(in [^,]+,\s*var\(--warning\)' apps/desktop/src/features/statistics
```

Expected: exit code `1` with no matches.

- [ ] **Step 8: Prepare the implementation commit**

Do not stage the existing Vitest cache file. Stage only the implementation
and contract files:

```bash
git add \
  apps/desktop/src/features/statistics/statistics.css \
  apps/desktop/src/features/statistics/preferences.ts \
  apps/desktop/src/features/statistics/preferences.test.ts \
  apps/desktop/src/styles/tokens.test.ts
git diff --cached --check
git commit -m "feat: use blue statistics accent"
```

Expected: the commit succeeds and
`node_modules/.vite/vitest/**/results.json` remains unstaged.

### Task 2: Verify the complete Statistics refinement

**Files:**

- Modify: `design-qa.md`
- Verify: `apps/desktop/src/features/statistics/**`
- Verify: `apps/desktop/src/styles/tokens.test.ts`

- [ ] **Step 1: Run the complete Statistics and scroll-surface suite**

Run from `apps/desktop`:

```bash
npm test -- src/features/statistics src/components/ScrollArea.test.tsx src/styles/tokens.test.ts
```

Expected: all selected files and tests PASS.

- [ ] **Step 2: Run the full frontend suite**

Run from `apps/desktop`:

```bash
npm test
```

Expected: exit code `0` with no failed test files.

- [ ] **Step 3: Run the production frontend build**

Run from `apps/desktop`:

```bash
npm run build
```

Expected: TypeScript and Vite build PASS. The existing chunk-size warning may
remain, but no compilation or bundling error is allowed.

- [ ] **Step 4: Run final source checks**

Run from the repository root:

```bash
git diff --check
```

Expected: exit code `0`.

Run:

```bash
rg -n '<select|linear-gradient|radial-gradient|conic-gradient|overflow-x[[:space:]]*:[[:space:]]*(auto|scroll)|width[[:space:]]*:[[:space:]]*max-content' apps/desktop/src/features/statistics
```

Expected: exit code `1` with no matches.

- [ ] **Step 5: Update the blocked design-QA record**

In `design-qa.md`, add a dated section recording:

- the exact source revision and dirty-file scope tested;
- the new reference image path;
- focused-suite, full-suite, build, stale-orange scan, and diff-check results;
- confirmation that no Library, Tauri, Vite runtime, browser capture, or
  WKWebView visual comparison was performed;
- `final result: blocked` remains unchanged.

Do not claim that source inspection or passing tests prove the rendered
light/dark colors.

- [ ] **Step 6: Commit the QA evidence**

```bash
git add design-qa.md
git diff --cached --check
git commit -m "docs: record blue statistics verification"
```

Expected: only `design-qa.md` is included in this commit.
