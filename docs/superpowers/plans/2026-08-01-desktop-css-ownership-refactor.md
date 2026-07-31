# Desktop CSS Ownership Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the desktop application's 4,488-line global stylesheet into deterministic foundation, shell, and feature-owned stylesheets without changing selectors, declarations, loading behavior, visual output, or WKWebView scroll behavior.

**Architecture:** Keep global theme and element behavior under `src/styles`, put the application shell under `src/app`, and colocate one plain global BEM stylesheet with each feature that owns styles. Keep every stylesheet imported synchronously and exactly once from `src/main.tsx`, in an explicit dependency order. Use guarded mechanical migration scripts so line coverage is provable before any source file is overwritten.

**Tech Stack:** React 19, TypeScript, plain global CSS/BEM, Vite 7, Vitest 3, Tauri 2, macOS WKWebView.

**Design spec:** `docs/superpowers/specs/2026-08-01-desktop-css-ownership-refactor-design.md`

---

## Guardrails for the Implementing Agent

- This is a structural refactor. Do not rename selectors, edit declaration values, reformat moved CSS, deduplicate rules, add `@layer`, introduce CSS Modules, or add lazy loading.
- Use `apply_patch` for hand-written edits. The temporary Node migration scripts below may perform the bulk mechanical rewrite after their hashes and coverage checks pass.
- The approved baseline `tokens.css` is exactly 4,488 lines, 87,253 bytes, and SHA-256 `4e25223508aa4f986d7b57ae3c00444baa3e73e9cd509265db72497991a97940`. If the hash guard fails, stop. Do not weaken the guard or run a line-range split against changed CSS; remap the changed file first.
- The worktree already contains unrelated package-lock changes. Never stage or commit `apps/desktop/package-lock.json`, root `package-lock.json`, or `node_modules/.package-lock.json` as part of this refactor.
- Do not treat an already-running `Library.app`, `tauri dev`, Vite process, or `library_desktop` process as verification of the current checkout.
- Do not alter `/Applications/Library.app`.
- Preserve the native scrollbar fallback in `base.css`, the custom `.scroll-area` primitive, every existing `padding-right: 20px` scroll inset assertion, and all Statistics scroll-surface assertions.

## Final File Map

**Create:**

- `apps/desktop/src/styles/base.css` — global document, form, drag-region, focus, and native scrollbar fallback rules.
- `apps/desktop/src/styles/primitives.css` — reusable global BEM primitives and shared `fadeIn` keyframe.
- `apps/desktop/src/styles/base.test.ts` — global platform and scrollbar regression assertions.
- `apps/desktop/src/styles/primitives.test.ts` — shared Combobox regression assertions.
- `apps/desktop/src/styles/cssArchitecture.test.ts` — ownership and import-order contract.
- `apps/desktop/src/app/app.css` — application shell and sidebar.
- `apps/desktop/src/features/settings/settings.css` — Settings page and editor/modal styling.
- `apps/desktop/src/features/library/library.css` — Library, import menu, document grid/card, and loading animations.
- `apps/desktop/src/features/library/libraryStyles.test.ts` — Library CSS regression assertion.
- `apps/desktop/src/features/drive/drive.css` — Drive picker/setup modal and `modalScaleUp`.
- `apps/desktop/src/features/memora/memora.css` — Memora, deck detail, and deck learning dialog.
- `apps/desktop/src/features/cards/cards.css` — Card Browser, SourceViewer, CardSidePanel, and `slideIn`.
- `apps/desktop/src/features/reader/reader.css` — Reader and PDF surface styling.
- `apps/desktop/src/features/reader/readerStyles.test.ts` — Reader ScrollArea assertion.
- `apps/desktop/src/features/review/review.css` — Review page and Review-owned SourceViewer overrides.
- `apps/desktop/src/features/review/reviewStyles.test.ts` — Review CSS geometry and inset assertions.
- `apps/desktop/src/features/search/search.css` — Command Palette styling.
- `apps/desktop/src/features/search/searchStyles.test.ts` — Command Palette regression assertion.
- `apps/desktop/src/features/statistics/statisticsStyles.test.ts` — existing Statistics CSS assertions moved beside the feature.

**Modify:**

- `apps/desktop/src/styles/tokens.css` — reduce to the two approved theme blocks.
- `apps/desktop/src/styles/tokens.test.ts` — retain only the token-owned theme assertion.
- `apps/desktop/src/main.tsx` — replace two CSS imports with the approved deterministic import list.
- `apps/desktop/src/features/cards/SourceViewer.test.ts` — read `cards.css` instead of the former monolith.
- `docs/superpowers/specs/2026-08-01-desktop-css-ownership-refactor-design.md` — already clarifies shared `fadeIn` ownership.

**Keep unchanged:**

- `apps/desktop/src/features/statistics/statistics.css` — remains one feature stylesheet.
- All TSX `className` values.
- All production TypeScript and Rust behavior.

---

### Task 1: Record a clean behavioral baseline

**Files:**

- Read: `apps/desktop/src/styles/tokens.css`
- Read: `apps/desktop/src/styles/tokens.test.ts`
- Read: `apps/desktop/src/features/cards/SourceViewer.test.ts`
- Read: `apps/desktop/src/main.tsx`
- Do not modify files in this task.

- [ ] **Step 1: Record the exact checkout and unrelated worktree state**

Run from the repository root:

```bash
git rev-parse --short HEAD
git status --short
shasum -a 256 apps/desktop/src/styles/tokens.css
wc -lc apps/desktop/src/styles/tokens.css apps/desktop/src/features/statistics/statistics.css
```

Expected:

- The `tokens.css` hash is `4e25223508aa4f986d7b57ae3c00444baa3e73e9cd509265db72497991a97940`.
- `tokens.css` reports 4,488 lines and 87,253 bytes.
- The unrelated package-lock changes remain visible and unstaged.

- [ ] **Step 2: Run the CSS-focused baseline tests**

Run:

```bash
cd apps/desktop
npm test -- src/styles/tokens.test.ts src/features/cards/SourceViewer.test.ts
```

Expected: PASS, 2 test files and 31 tests.

- [ ] **Step 3: Record the pre-refactor production CSS output**

Run:

```bash
npm run build
find dist/assets -maxdepth 1 -name '*.css' -exec wc -c {} +
```

Expected: TypeScript and Vite build exit 0. Copy the CSS byte-count output into the task notes; do not add generated `dist` files to git.

- [ ] **Step 4: Return to the repository root**

Run:

```bash
cd ../..
```

Expected: `pwd` would be the repository root if checked.

---

### Task 2: Add the failing stylesheet ownership contract

**Files:**

- Create: `apps/desktop/src/styles/cssArchitecture.test.ts`
- Test: `apps/desktop/src/styles/cssArchitecture.test.ts`

- [ ] **Step 1: Add the architecture test**

Create `apps/desktop/src/styles/cssArchitecture.test.ts` with exactly:

```ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));

const internalStyles = [
  "tokens.css",
  "base.css",
  "primitives.css",
  "../app/app.css",
  "../features/settings/settings.css",
  "../features/library/library.css",
  "../features/memora/memora.css",
  "../features/cards/cards.css",
  "../features/reader/reader.css",
  "../features/review/review.css",
  "../features/search/search.css",
  "../features/drive/drive.css",
  "../features/statistics/statistics.css",
] as const;

const expectedImports = [
  'import "./styles/tokens.css";',
  'import "./styles/base.css";',
  'import "./styles/primitives.css";',
  'import "./app/app.css";',
  'import "./features/settings/settings.css";',
  'import "./features/library/library.css";',
  'import "./features/memora/memora.css";',
  'import "./features/cards/cards.css";',
  'import "./features/reader/reader.css";',
  'import "./features/review/review.css";',
  'import "./features/search/search.css";',
  'import "./features/drive/drive.css";',
  'import "./features/statistics/statistics.css";',
  'import "pdfjs-dist/web/pdf_viewer.css";',
] as const;

function read(relativePath: string): string {
  return readFileSync(join(currentDir, relativePath), "utf8");
}

test("keeps desktop stylesheet ownership and import order explicit", () => {
  const tokens = read("tokens.css");
  const entry = read("../main.tsx");

  expect(tokens).not.toMatch(/^\s*\.[a-z_-]/im);
  expect(tokens).not.toContain("@media");
  expect(tokens).not.toContain("@keyframes");
  expect(tokens).not.toMatch(
    /\.(?:app-shell|app-sidebar|settings-page|library-page|memora-|deck-detail-page|card-browser|source-viewer|reader-|review-page|command-palette|drive-)/,
  );

  const offsets = expectedImports.map((statement) => entry.indexOf(statement));
  expect(offsets.every((offset) => offset >= 0)).toBe(true);
  expect(offsets).toEqual([...offsets].sort((left, right) => left - right));

  for (const statement of expectedImports) {
    expect(entry.split(statement).length - 1).toBe(1);
  }

  for (const relativePath of internalStyles) {
    expect(read(relativePath), relativePath).not.toHaveLength(0);
  }
});

test("keeps shared animation and scrollbar ownership out of feature CSS", () => {
  const primitives = read("primitives.css");
  const featureCss = internalStyles
    .filter((path) => path.startsWith("../features/"))
    .map(read)
    .join("\n");

  expect(primitives.match(/@keyframes fadeIn/g)?.length ?? 0).toBe(1);
  expect(featureCss).not.toContain("@keyframes fadeIn");
  expect(featureCss).not.toMatch(/::-webkit-scrollbar/);
});
```

- [ ] **Step 2: Run the test and confirm the intended failure**

Run:

```bash
cd apps/desktop
npm test -- src/styles/cssArchitecture.test.ts
```

Expected: FAIL with `ENOENT` for `base.css`, because the ownership files do not exist yet. A syntax error or unrelated failure is not the expected red state; fix the test before continuing.

- [ ] **Step 3: Return to the repository root without committing the red test alone**

Run:

```bash
cd ../..
```

Expected: the new test remains uncommitted and failing for the intended missing-file reason.

---

### Task 3: Perform the guarded mechanical CSS split

**Files:**

- Temporarily create, then delete: `apps/desktop/scripts/split-css-by-ownership.mjs`
- Create: all production CSS files in the Final File Map
- Modify: `apps/desktop/src/styles/tokens.css`
- Modify: `apps/desktop/src/main.tsx`
- Modify: `apps/desktop/src/styles/tokens.test.ts`
- Modify: `apps/desktop/src/features/cards/SourceViewer.test.ts`
- Test: `apps/desktop/src/styles/cssArchitecture.test.ts`
- Test: `apps/desktop/src/styles/tokens.test.ts`
- Test: `apps/desktop/src/features/cards/SourceViewer.test.ts`

- [ ] **Step 1: Add the one-time guarded split script**

Create `apps/desktop/scripts/split-css-by-ownership.mjs` with exactly:

```js
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(desktopDir, "src");
const sourcePath = join(srcDir, "styles/tokens.css");
const expectedHash =
  "4e25223508aa4f986d7b57ae3c00444baa3e73e9cd509265db72497991a97940";

const source = readFileSync(sourcePath, "utf8");
const actualHash = createHash("sha256").update(source).digest("hex");
if (actualHash !== expectedHash) {
  throw new Error(
    `tokens.css changed: expected ${expectedHash}, received ${actualHash}. ` +
      "Stop and remap the source before splitting.",
  );
}

const lines = source.split("\n");
if (lines.at(-1) === "") lines.pop();
if (lines.length !== 4488) {
  throw new Error(`Expected 4488 source lines, received ${lines.length}`);
}

const fragments = [
  ["tokens", 1, 182, "styles/tokens.css"],
  ["base-core", 183, 273, "styles/base.css"],
  ["app-shell", 274, 422, "app/app.css"],
  ["settings-a", 423, 731, "features/settings/settings.css"],
  ["memora-dialog", 732, 844, "features/memora/memora.css"],
  ["settings-b", 845, 913, "features/settings/settings.css"],
  ["brand-model", 914, 920, "styles/primitives.css"],
  ["settings-icon-override", 921, 925, "features/settings/settings.css"],
  ["brand-provider", 926, 945, "styles/primitives.css"],
  ["settings-c", 946, 1106, "features/settings/settings.css"],
  ["library-root", 1107, 1111, "features/library/library.css"],
  ["buttons-actions", 1112, 1203, "styles/primitives.css"],
  ["memora-main", 1204, 1837, "features/memora/memora.css"],
  ["library-main", 1838, 2252, "features/library/library.css"],
  ["search", 2253, 2422, "features/search/search.css"],
  ["library-mobile", 2423, 2433, "features/library/library.css"],
  ["reader-a", 2434, 2503, "features/reader/reader.css"],
  ["scroll-area", 2504, 2528, "styles/primitives.css"],
  ["reader-b", 2529, 2809, "features/reader/reader.css"],
  ["cards-a", 2810, 3509, "features/cards/cards.css"],
  ["shared-fade-in", 3510, 3514, "styles/primitives.css"],
  ["cards-b", 3515, 3632, "features/cards/cards.css"],
  ["review-main", 3633, 4005, "features/review/review.css"],
  ["combobox", 4006, 4140, "styles/primitives.css"],
  ["base-focus", 4141, 4146, "styles/base.css"],
  ["drive", 4147, 4474, "features/drive/drive.css"],
  ["review-waiting", 4475, 4488, "features/review/review.css"],
];

let cursor = 1;
let roundTrip = "";
const outputs = new Map();

for (const [name, start, end, target] of fragments) {
  if (start !== cursor) {
    throw new Error(`${name}: expected to start at ${cursor}, received ${start}`);
  }
  if (end < start) {
    throw new Error(`${name}: invalid range ${start}-${end}`);
  }

  const content = `${lines.slice(start - 1, end).join("\n")}\n`;
  roundTrip += content;
  outputs.set(target, `${outputs.get(target) ?? ""}${content}`);
  cursor = end + 1;
}

if (cursor !== lines.length + 1) {
  throw new Error(`Coverage stopped at ${cursor}; expected ${lines.length + 1}`);
}
if (roundTrip !== source) {
  throw new Error("Round-trip coverage failed; no files were written");
}

for (const target of outputs.keys()) {
  const absoluteTarget = join(srcDir, target);
  if (absoluteTarget !== sourcePath && existsSync(absoluteTarget)) {
    throw new Error(`Refusing to overwrite existing target: ${absoluteTarget}`);
  }
}

for (const [target, content] of outputs) {
  const absoluteTarget = join(srcDir, target);
  mkdirSync(dirname(absoluteTarget), { recursive: true });
  writeFileSync(absoluteTarget, content);
  console.log(
    `${target}: ${content.split("\n").length - 1} lines, ` +
      `${Buffer.byteLength(content)} bytes`,
  );
}
```

- [ ] **Step 2: Run the split script once**

Run:

```bash
node apps/desktop/scripts/split-css-by-ownership.mjs
```

Expected exact report:

```text
styles/tokens.css: 182 lines, 5516 bytes
styles/base.css: 97 lines, 1790 bytes
app/app.css: 149 lines, 2765 bytes
features/settings/settings.css: 544 lines, 10419 bytes
features/memora/memora.css: 747 lines, 14647 bytes
styles/primitives.css: 284 lines, 5305 bytes
features/library/library.css: 431 lines, 8126 bytes
features/search/search.css: 170 lines, 3410 bytes
features/reader/reader.css: 351 lines, 6714 bytes
features/cards/cards.css: 818 lines, 15390 bytes
features/review/review.css: 387 lines, 6807 bytes
features/drive/drive.css: 328 lines, 6454 bytes
```

The script proves every original line is assigned exactly once before writing. Do not rerun it after the first successful run because the source hash has intentionally changed.

- [ ] **Step 3: Replace the stylesheet imports in `main.tsx`**

Replace:

```tsx
import "./styles/tokens.css";
import "./features/statistics/statistics.css";
import "pdfjs-dist/web/pdf_viewer.css";
```

with exactly:

```tsx
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/primitives.css";
import "./app/app.css";
import "./features/settings/settings.css";
import "./features/library/library.css";
import "./features/memora/memora.css";
import "./features/cards/cards.css";
import "./features/reader/reader.css";
import "./features/review/review.css";
import "./features/search/search.css";
import "./features/drive/drive.css";
import "./features/statistics/statistics.css";
import "pdfjs-dist/web/pdf_viewer.css";
```

- [ ] **Step 4: Point the existing regression tests at their new owner files**

In `apps/desktop/src/styles/tokens.test.ts`, make only the following fixture-path changes. Keep all assertions unchanged.

| Test name | Required fixture expression |
| --- | --- |
| `does not apply global color transitions to every element` | `join(currentDir, "base.css")` |
| `moves lowered review states down responsively` | `join(currentDir, "../features/review/review.css")` |
| `uses a dark-theme-safe compact surface for the import trigger` | `join(currentDir, "../features/library/library.css")` |
| `uses a semantic flat hover surface for shared comboboxes` | `join(currentDir, "primitives.css")` |
| `keeps disabled Statistics and shared combobox controls on their normal surfaces` | Rename `tokensCss` to `primitivesCss`, read `join(currentDir, "primitives.css")`, and match the Combobox block from `primitivesCss` |
| `uses a tinted glass fallback instead of a fully transparent sidebar` | Keep `join(currentDir, "tokens.css")` |
| `uses one transparent-track scrollbar primitive across the app` | Read `tokens.css` and `base.css` and join them as shown below |
| Every Statistics CSS test | Keep `join(currentDir, "../features/statistics/statistics.css")` |
| Every Review CSS test | `join(currentDir, "../features/review/review.css")` |
| `uses neutral palette-specific scrollbars and match highlights` | `join(currentDir, "../features/search/search.css")` |

For the scrollbar test, replace its single-file read with exactly:

```ts
const css = [
  readFileSync(join(currentDir, "tokens.css"), "utf8"),
  readFileSync(join(currentDir, "base.css"), "utf8"),
].join("\n");
```

In `apps/desktop/src/features/cards/SourceViewer.test.ts`, change:

```ts
const css = readFileSync(join(currentDir, "../../styles/tokens.css"), "utf8");
```

to:

```ts
const css = readFileSync(join(currentDir, "cards.css"), "utf8");
```

- [ ] **Step 5: Run the ownership and existing CSS regression tests**

Run:

```bash
cd apps/desktop
npm test -- src/styles/cssArchitecture.test.ts src/styles/tokens.test.ts src/features/cards/SourceViewer.test.ts
```

Expected: PASS, 3 files and 33 tests. If a feature assertion reads an empty match, fix its fixture path; do not weaken the assertion.

- [ ] **Step 6: Return to the root and delete the one-time split script**

Run:

```bash
cd ../..
```

Delete `apps/desktop/scripts/split-css-by-ownership.mjs` with `apply_patch`:

```diff
*** Begin Patch
*** Delete File: apps/desktop/scripts/split-css-by-ownership.mjs
*** End Patch
```

- [ ] **Step 7: Verify and commit the production split**

Run:

```bash
git diff --check
git status --short
git diff --stat
git add \
  apps/desktop/src/main.tsx \
  apps/desktop/src/styles/tokens.css \
  apps/desktop/src/styles/base.css \
  apps/desktop/src/styles/primitives.css \
  apps/desktop/src/styles/cssArchitecture.test.ts \
  apps/desktop/src/styles/tokens.test.ts \
  apps/desktop/src/app/app.css \
  apps/desktop/src/features/settings/settings.css \
  apps/desktop/src/features/library/library.css \
  apps/desktop/src/features/drive/drive.css \
  apps/desktop/src/features/memora/memora.css \
  apps/desktop/src/features/cards/cards.css \
  apps/desktop/src/features/cards/SourceViewer.test.ts \
  apps/desktop/src/features/reader/reader.css \
  apps/desktop/src/features/review/review.css \
  apps/desktop/src/features/search/search.css
git diff --cached --check
git commit -m "refactor: split desktop CSS by ownership"
```

Expected: commit succeeds. Confirm the unrelated package locks are not staged.

---

### Task 4: Move regression tests beside their CSS owners

**Files:**

- Temporarily create, then delete: `apps/desktop/scripts/split-css-tests-by-ownership.mjs`
- Modify: `apps/desktop/src/styles/tokens.test.ts`
- Create: `apps/desktop/src/styles/base.test.ts`
- Create: `apps/desktop/src/styles/primitives.test.ts`
- Create: feature `*Styles.test.ts` files listed in the Final File Map
- Test: all created test files

- [ ] **Step 1: Add the guarded test-migration script**

Create `apps/desktop/scripts/split-css-tests-by-ownership.mjs` with exactly:

```js
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(desktopDir, "src/styles/tokens.test.ts");
const source = readFileSync(sourcePath, "utf8");
const firstTest = source.indexOf('test("');
if (firstTest < 0) throw new Error("No top-level tests found");

const header = source.slice(0, firstTest).trimEnd();
const matches = [...source.matchAll(/^test\("([^"]+)"/gm)];
const blocks = new Map();

for (let index = 0; index < matches.length; index += 1) {
  const match = matches[index];
  const next = matches[index + 1];
  const block = source.slice(match.index, next?.index ?? source.length).trimEnd();
  blocks.set(match[1], `${block}\n`);
}

const groups = [
  {
    target: "src/styles/tokens.test.ts",
    tests: ["uses a tinted glass fallback instead of a fully transparent sidebar"],
    rewrites: [],
  },
  {
    target: "src/styles/base.test.ts",
    tests: [
      "does not apply global color transitions to every element",
      "keeps the native window transparent for the sidebar glass surface",
      "uses one transparent-track scrollbar primitive across the app",
      "uses only public macOS view APIs to enable overlay scrollers",
    ],
    rewrites: [],
  },
  {
    target: "src/styles/primitives.test.ts",
    tests: [
      "uses a semantic flat hover surface for shared comboboxes",
      "keeps disabled Statistics and shared combobox controls on their normal surfaces",
    ],
    rewrites: [],
  },
  {
    target: "src/features/library/libraryStyles.test.ts",
    tests: ["uses a dark-theme-safe compact surface for the import trigger"],
    rewrites: [["../features/library/library.css", "library.css"]],
  },
  {
    target: "src/features/statistics/statisticsStyles.test.ts",
    tests: [
      "defines a theme-aware blue Statistics accent for charts and sparklines",
      "uses semantic tokens in Statistics CSS with proper scroll-surface padding",
      "pins every approved desktop Statistics density token",
      "keeps the statistics dashboard flat, responsive, and token-correct",
      "keeps non-interactive Statistics insight cards free of clickable affordances",
      "keeps the calendar time heatmap inside its card without horizontal scrolling",
      "pins the Statistics master detail and WKWebView inset contract",
      "loads the Statistics stylesheet from the application entry point",
    ],
    rewrites: [
      ["../features/statistics/statistics.css", "statistics.css"],
      ["../features/statistics/components/", "components/"],
      ["../main.tsx", "../../main.tsx"],
    ],
  },
  {
    target: "src/features/review/reviewStyles.test.ts",
    tests: [
      "moves lowered review states down responsively",
      "anchors the review route and source split to the viewport height",
      "keeps the flashcard compact while the source panel can fill the viewport",
      "splits the review and source panes evenly",
      "keeps the flashcard geometry stable while a video is open",
      "uses compact review rating controls",
    ],
    rewrites: [["../features/review/review.css", "review.css"]],
  },
  {
    target: "src/features/reader/readerStyles.test.ts",
    tests: ["uses the reusable ScrollArea for the reader's thumbnail and PDF panes"],
    rewrites: [["../features/reader/ReaderPage.tsx", "ReaderPage.tsx"]],
  },
  {
    target: "src/features/search/searchStyles.test.ts",
    tests: ["uses neutral palette-specific scrollbars and match highlights"],
    rewrites: [["../features/search/search.css", "search.css"]],
  },
];

const expectedNames = new Set(groups.flatMap((group) => group.tests));
const discoveredNames = new Set(blocks.keys());
if (expectedNames.size !== 24 || discoveredNames.size !== 24) {
  throw new Error(
    `Expected 24 mapped and discovered tests; received ` +
      `${expectedNames.size} mapped and ${discoveredNames.size} discovered`,
  );
}
for (const name of discoveredNames) {
  if (!expectedNames.has(name)) throw new Error(`Unmapped test: ${name}`);
}
for (const name of expectedNames) {
  if (!discoveredNames.has(name)) throw new Error(`Missing test: ${name}`);
}

for (const group of groups) {
  const targetPath = join(desktopDir, group.target);
  if (targetPath !== sourcePath && existsSync(targetPath)) {
    throw new Error(`Refusing to overwrite existing target: ${targetPath}`);
  }

  let output = `${header}\n\n${group.tests.map((name) => blocks.get(name)).join("\n")}`;
  for (const [before, after] of group.rewrites) {
    output = output.replaceAll(before, after);
  }
  writeFileSync(targetPath, output);
  console.log(`${group.target}: ${group.tests.length} tests`);
}
```

- [ ] **Step 2: Run the test-migration script once**

Run:

```bash
node apps/desktop/scripts/split-css-tests-by-ownership.mjs
```

Expected exact report:

```text
src/styles/tokens.test.ts: 1 tests
src/styles/base.test.ts: 4 tests
src/styles/primitives.test.ts: 2 tests
src/features/library/libraryStyles.test.ts: 1 tests
src/features/statistics/statisticsStyles.test.ts: 8 tests
src/features/review/reviewStyles.test.ts: 6 tests
src/features/reader/readerStyles.test.ts: 1 tests
src/features/search/searchStyles.test.ts: 1 tests
```

- [ ] **Step 3: Verify test counts and fixture paths before running Vitest**

Run:

```bash
rg -n '^test\(' \
  apps/desktop/src/styles/tokens.test.ts \
  apps/desktop/src/styles/base.test.ts \
  apps/desktop/src/styles/primitives.test.ts \
  apps/desktop/src/features/library/libraryStyles.test.ts \
  apps/desktop/src/features/statistics/statisticsStyles.test.ts \
  apps/desktop/src/features/review/reviewStyles.test.ts \
  apps/desktop/src/features/reader/readerStyles.test.ts \
  apps/desktop/src/features/search/searchStyles.test.ts
rg -n 'tokens\.css|base\.css|primitives\.css|statistics\.css|review\.css|search\.css|library\.css' \
  apps/desktop/src/styles/*.test.ts \
  apps/desktop/src/features/*/*Styles.test.ts
```

Expected: 24 total `test(` declarations with the 1/4/2/1/8/6/1/1 distribution above. Feature-local test files must use feature-local paths after the scripted rewrites.

- [ ] **Step 4: Run all migrated CSS regression tests**

Run:

```bash
cd apps/desktop
npm test -- \
  src/styles/cssArchitecture.test.ts \
  src/styles/tokens.test.ts \
  src/styles/base.test.ts \
  src/styles/primitives.test.ts \
  src/features/library/libraryStyles.test.ts \
  src/features/statistics/statisticsStyles.test.ts \
  src/features/review/reviewStyles.test.ts \
  src/features/reader/readerStyles.test.ts \
  src/features/search/searchStyles.test.ts \
  src/features/cards/SourceViewer.test.ts
```

Expected: PASS, 10 files and 33 tests.

- [ ] **Step 5: Return to the root and delete the one-time test script**

Run:

```bash
cd ../..
```

Delete `apps/desktop/scripts/split-css-tests-by-ownership.mjs` with `apply_patch`:

```diff
*** Begin Patch
*** Delete File: apps/desktop/scripts/split-css-tests-by-ownership.mjs
*** End Patch
```

- [ ] **Step 6: Review the moved tests for accidental assertion changes**

Run:

```bash
git diff --word-diff=porcelain HEAD -- apps/desktop/src/styles apps/desktop/src/features | rg '^[+-][^+-]' || true
```

The command may print moved text because git does not understand a one-to-many split. Manually confirm that changes inside test bodies are limited to fixture paths and the `tokensCss` to `primitivesCss` local rename. Assertions must otherwise remain byte-for-byte equivalent.

- [ ] **Step 7: Commit the test ownership migration**

Run:

```bash
git add \
  apps/desktop/src/styles/tokens.test.ts \
  apps/desktop/src/styles/base.test.ts \
  apps/desktop/src/styles/primitives.test.ts \
  apps/desktop/src/features/library/libraryStyles.test.ts \
  apps/desktop/src/features/statistics/statisticsStyles.test.ts \
  apps/desktop/src/features/review/reviewStyles.test.ts \
  apps/desktop/src/features/reader/readerStyles.test.ts \
  apps/desktop/src/features/search/searchStyles.test.ts
git diff --cached --check
git commit -m "test: align CSS regressions with style ownership"
```

Expected: commit succeeds without package-lock files.

---

### Task 5: Prove source preservation and run the complete automated suite

**Files:**

- Verify: all production CSS files
- Verify: all desktop tests
- Verify: `apps/desktop/dist/assets/*.css`
- Do not create committed files in this task.

- [ ] **Step 1: Verify the exact post-split source byte inventory**

Run from the repository root:

```bash
node --input-type=module -e '
import { readFileSync } from "node:fs";
const root = "apps/desktop/src/";
const expected = new Map([
  ["styles/tokens.css", 5516],
  ["styles/base.css", 1790],
  ["styles/primitives.css", 5305],
  ["app/app.css", 2765],
  ["features/settings/settings.css", 10419],
  ["features/library/library.css", 8126],
  ["features/memora/memora.css", 14647],
  ["features/cards/cards.css", 15390],
  ["features/reader/reader.css", 6714],
  ["features/review/review.css", 6807],
  ["features/search/search.css", 3410],
  ["features/drive/drive.css", 6454],
]);
let total = 0;
for (const [path, bytes] of expected) {
  const actual = Buffer.byteLength(readFileSync(root + path));
  if (actual !== bytes) throw new Error(`${path}: expected ${bytes}, received ${actual}`);
  total += actual;
}
if (total !== 87253) throw new Error(`Expected 87253 total bytes, received ${total}`);
console.log(`PASS: ${expected.size} files preserve ${total} source bytes`);
'
```

Expected: `PASS: 12 files preserve 87253 source bytes`.

This is a migration-time proof, not a permanent test. If it fails, inspect for an accidental edit; do not update the expected numbers unless the approved spec changes.

- [ ] **Step 2: Confirm ownership boundaries by selector family**

Run:

```bash
rg -n '^\.(app-shell|app-sidebar)' apps/desktop/src/app/app.css
rg -n '^\.(settings-page)' apps/desktop/src/features/settings/settings.css
rg -n '^\.(library-page|library-import-menu|document-grid|document-card|cover-loading)' apps/desktop/src/features/library/library.css
rg -n '^\.(memora-|deck-detail-page|deck-learning-dialog)' apps/desktop/src/features/memora/memora.css
rg -n '^\.(card-browser|card-side-panel|source-viewer)' apps/desktop/src/features/cards/cards.css
rg -n '^\.(reader-|outline-node-title)' apps/desktop/src/features/reader/reader.css
rg -n '^\.(review-page)' apps/desktop/src/features/review/review.css
rg -n '^\.(command-palette)' apps/desktop/src/features/search/search.css
rg -n '^\.(drive-picker|drive-setup-modal)' apps/desktop/src/features/drive/drive.css
```

Expected: every command prints matches only from the named owner file. Investigate any missing family before continuing.

- [ ] **Step 3: Run the complete desktop test suite**

Run:

```bash
cd apps/desktop
npm test
```

Expected: all Vitest files pass with exit code 0.

- [ ] **Step 4: Run the production frontend build and compare CSS size**

Run:

```bash
npm run build
find dist/assets -maxdepth 1 -name '*.css' -exec wc -c {} +
```

Expected: build exits 0. Compare the printed CSS bytes with Task 1. A hash/name change is expected because rule order changed; meaningful byte growth or duplicated rule output is not expected.

- [ ] **Step 5: Inspect final tracked changes without staging unrelated files**

Run:

```bash
cd ../..
git diff --check
git status --short
git log -3 --oneline
```

Expected: no whitespace errors; the two implementation commits are present; unrelated package-lock files remain unstaged.

---

### Task 6: Verify fresh macOS/Tauri runtime behavior

**Files and runtime:**

- Verify checkout revision and worktree state.
- Launch from: `apps/desktop`
- Expected dev executable: `apps/desktop/src-tauri/target/debug/library_desktop`
- Do not modify `/Applications/Library.app`.

- [ ] **Step 1: Record the exact source being tested**

Run from the repository root:

```bash
git rev-parse --short HEAD
git status --short
pgrep -fl 'tauri|vite|library_desktop' || true
```

Expected: revision and worktree status are recorded. Do not silently reuse any process printed by `pgrep`. Do not kill unrelated user processes without confirming ownership.

- [ ] **Step 2: Start a fresh development runtime from this checkout**

After resolving any port/process conflict safely, run in a dedicated terminal from `apps/desktop`:

```bash
npm run tauri dev
```

Expected: Vite and Rust compilation complete, then the current checkout launches. Confirm the running executable belongs to this checkout with:

```bash
pgrep -fl library_desktop
```

The path/process must correspond to `apps/desktop/src-tauri/target/debug/library_desktop`, not an installed application.

- [ ] **Step 3: Check representative surfaces in light theme**

Verify all accessible states below. Record any state that cannot be reached because test data or credentials are unavailable; do not report it as passed.

```text
[ ] App shell and resizable sidebar
[ ] Settings navigation, provider editor, and modal
[ ] Library header, import menu, document grid/card, and loading placeholder
[ ] Memora deck list, deck detail, and learning-settings dialog
[ ] Card Browser or Trash table, SourceViewer, and CardSidePanel
[ ] Reader sidebar, thumbnail list, toolbar, PDF surface, search, and tag dropdown
[ ] Review card, ratings, completed state, and SourceViewer split when available
[ ] Command Palette input, result list, selected state, and footer
[ ] Drive picker/setup modal when credentials/state allow
[ ] Statistics dashboard and master-detail entity pane
```

Expected: no visual difference attributable to the split; focus, modal animation, responsive layout, and theme token usage remain intact.

- [ ] **Step 4: Repeat theme-sensitive checks in dark theme**

At minimum recheck:

```text
[ ] App/sidebar glass surface
[ ] Settings inputs and Combobox
[ ] Library import trigger and document card menu
[ ] Reader sidebar, canvas chrome, toolbar, and search
[ ] Review card and SourceViewer chrome
[ ] Command Palette
[ ] Drive modal surfaces
[ ] Statistics cards and selected entity rows
```

Expected: no hard-coded light surface, white gutter, missing token, or unreadable control appears.

- [ ] **Step 5: Perform the mandatory WKWebView scroll checks**

Use long content and verify both themes:

```text
[ ] Reader thumbnail pane has no white native track
[ ] Reader PDF pane has no white native track
[ ] Review scroll content keeps at least 20px thumb-side inset
[ ] Card Browser long content does not place controls beneath a thumb
[ ] Statistics entity pane has no white native track
[ ] Statistics entity rows and selected-row backgrounds stop before the thumb
[ ] Custom thumb does not cover text, buttons, inputs, or selected backgrounds
```

Expected: every accessible item passes. A passing Vitest assertion is not a substitute for this WKWebView check.

- [ ] **Step 6: Stop only the development processes started for this verification**

Use the terminal running `npm run tauri dev` and send Ctrl-C. Confirm its child Vite and `library_desktop` processes exit. Do not terminate unrelated processes.

---

### Task 7: Final review and handoff

**Files:**

- Review: all committed changes from Tasks 3 and 4
- Review: design spec and this implementation plan
- Do not modify production code unless verification found a real regression.

- [ ] **Step 1: Review scope and commits**

Run:

```bash
git status --short
git log --oneline --decorate -5
git show --stat --oneline HEAD~1
git show --stat --oneline HEAD
```

Expected:

- One production split commit and one test-ownership commit.
- No temporary migration scripts are tracked.
- No package-lock changes are included.
- No TSX, Rust, route, command registry, or feature behavior changed.

- [ ] **Step 2: Prepare the final implementation report**

The report must include:

```text
- Outcome: CSS split by foundation/app/feature ownership
- Automated verification: focused tests, full Vitest suite, and Vite build results
- Source preservation: 12 files, 87,253 original bytes preserved
- Runtime revision: exact `git rev-parse --short HEAD`
- Launch mode: `tauri dev`
- Tested executable: absolute path to `apps/desktop/src-tauri/target/debug/library_desktop`
- Manual coverage: list passed screens/themes/scroll surfaces
- Unverified states: list anything inaccessible because of data or credentials
- Unrelated worktree state: package-lock changes were preserved and excluded
```

If fresh runtime verification was not completed, say exactly: `Fresh macOS/Tauri runtime verification was not performed.` Do not infer runtime correctness from Vitest or Vite.

---

## Expected Commit Sequence

```text
refactor: split desktop CSS by ownership
test: align CSS regressions with style ownership
```

Do not squash these during execution unless the user explicitly requests it. The first commit captures the production structure and required path fixes; the second makes the test suite follow the new ownership boundaries.
