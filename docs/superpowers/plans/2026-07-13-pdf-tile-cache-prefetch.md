# PDF Tile Cache and Prefetch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep PDF zoom and scrolling visually sharp by reusing and prefetching viewport tiles inside a byte-accounted 64 MiB cache without increasing PDF.js render concurrency.

**Architecture:** Add a global tile-budget manager that tracks completed canvas bytes and evicts unpinned LRU entries. Extend the pure viewport planner to normalize zoom, order visible and prefetch work, and use 512-pixel tiles. Refactor `PdfViewportTiles` from whole-generation state into persistent per-tile entries so cached levels and overlapping scroll regions are reused without rerasterization.

**Tech Stack:** React, TypeScript, PDF.js, Vitest, Tauri/WebKit, shell resource sampling.

---

## File map

- Create `apps/desktop/src/features/reader/pdfTileCache.ts`: byte-accounted LRU budget, pinning, eviction notifications, stats.
- Create `apps/desktop/src/features/reader/pdfTileCache.test.ts`: deterministic cache-limit and eviction tests.
- Modify `apps/desktop/src/features/reader/viewportTiles.ts`: 512-pixel grid, zoom normalization, visible/prefetch planning and priorities.
- Modify `apps/desktop/src/features/reader/viewportTiles.test.ts`: planner ordering, normalization, and ring coverage tests.
- Modify `apps/desktop/src/features/reader/PdfViewportTiles.tsx`: persistent cached tile entries, closest-scale fallback, progressive exact tiles, prefetch and eviction integration.
- Modify `apps/desktop/src/features/reader/PdfViewportTiles.test.tsx`: cache-hit, fallback, cancellation, prefetch, and unmount tests.
- Modify `apps/desktop/src/features/reader/ReaderPage.tsx`: pass a document cache namespace and preserve stable scale-1 page geometry.
- Modify `apps/desktop/src/features/reader/ReaderPage.test.tsx`: document isolation and final-scale coverage.
- Create `apps/desktop/scripts/sample-reader-resources.sh`: reproducible 100 ms CPU/RSS sampling for the source debug process.
- Create `apps/desktop/tmp/pdf-benchmarks/README.md`: scenario and baseline/final benchmark table.

### Task 1: Capture the current baseline

**Files:**
- Create: `apps/desktop/scripts/sample-reader-resources.sh`
- Create: `apps/desktop/tmp/pdf-benchmarks/README.md`

- [ ] **Step 1: Add the resource sampler**

Create a script that accepts a label, duration, and optional PID, refuses an `/Applications/Library.app` process, samples at 100 ms, and writes CSV plus a summary:

```bash
#!/usr/bin/env bash
set -euo pipefail

label=${1:?usage: sample-reader-resources.sh LABEL [SECONDS] [PID]}
seconds=${2:-20}
pid=${3:-$(pgrep -f 'target/debug/library_desktop' | head -n 1)}
command=$(ps -p "$pid" -o command=)
[[ "$command" == *"target/debug/library_desktop"* ]]
[[ "$command" != *"/Applications/Library.app"* ]]

collect_tree() {
  local root=$1 child
  printf '%s ' "$root"
  for child in $(pgrep -P "$root" 2>/dev/null || true); do
    collect_tree "$child"
  done
}

mkdir -p tmp/pdf-benchmarks
csv="tmp/pdf-benchmarks/${label}.csv"
echo 'elapsed_ms,cpu_percent,rss_kib' > "$csv"
samples=$((seconds * 10))
for ((index=0; index<samples; index+=1)); do
  pids=$(collect_tree "$pid")
  pid_list=$(echo "$pids" | xargs | tr ' ' ',')
  read -r cpu rss < <(ps -p "$pid_list" -o %cpu=,rss= | awk '{cpu+=$1; rss+=$2} END {print cpu, rss}')
  printf '%d,%s,%s\n' "$((index * 100))" "$cpu" "$rss" >> "$csv"
  sleep 0.1
done
awk -F, 'NR>1 {sum+=$2; if($2>cpuMax)cpuMax=$2; if($3>rssMax)rssMax=$3; last=$3; count++}
  END {printf "mean_cpu=%.2f peak_cpu=%.2f peak_rss_kib=%d settled_rss_kib=%d\n",sum/count,cpuMax,rssMax,last}' "$csv"
```

- [ ] **Step 2: Verify the sampler targets only the source process**

Run:

```bash
chmod +x scripts/sample-reader-resources.sh
./scripts/sample-reader-resources.sh smoke 1
```

Expected: a 10-row CSV and one summary line; the script exits non-zero if passed an Applications PID.

- [ ] **Step 3: Record the baseline**

With page 225 of `mml-book` open in the existing source app, run the sampler for 25 seconds while performing three `50% -> 300% -> 50% -> 300%` cycles and five viewport scrolls down/up. Record idle RSS, mean/peak CPU, peak/settled RSS, and the observed soft-preview interval in `tmp/pdf-benchmarks/README.md`.

- [ ] **Step 4: Commit the benchmark harness and baseline**

```bash
git add apps/desktop/scripts/sample-reader-resources.sh apps/desktop/tmp/pdf-benchmarks/README.md
git commit -m "test: capture PDF zoom resource baseline"
```

### Task 2: Implement the 64 MiB tile-budget manager

**Files:**
- Create: `apps/desktop/src/features/reader/pdfTileCache.ts`
- Create: `apps/desktop/src/features/reader/pdfTileCache.test.ts`

- [ ] **Step 1: Write failing byte-limit and pinning tests**

```ts
it("evicts the least recently used unpinned tile before exceeding the byte limit", () => {
  const cache = createPdfTileCacheBudget(100);
  const evicted: string[] = [];
  cache.subscribe((keys) => evicted.push(...keys));
  cache.insert({ key: "a", bytes: 60 });
  cache.insert({ key: "b", bytes: 40 });
  cache.touch("a");
  cache.insert({ key: "c", bytes: 30 });
  expect(evicted).toEqual(["b"]);
  expect(cache.stats()).toMatchObject({ bytes: 90, entries: 2 });
});

it("never evicts a pinned visible tile", () => {
  const cache = createPdfTileCacheBudget(100);
  cache.insert({ key: "visible", bytes: 70 });
  cache.pin("visible");
  expect(cache.insert({ key: "prefetch", bytes: 50 })).toBe(false);
  expect(cache.has("visible")).toBe(true);
});
```

- [ ] **Step 2: Run the tests and confirm red**

Run: `npm test -- src/features/reader/pdfTileCache.test.ts`

Expected: FAIL because `pdfTileCache.ts` does not exist.

- [ ] **Step 3: Implement the minimal cache API**

Export:

```ts
export const PDF_TILE_CACHE_LIMIT_BYTES = 64 * 1024 * 1024;

export interface PdfTileCacheStats {
  bytes: number;
  peakBytes: number;
  entries: number;
  hits: number;
  misses: number;
  evictions: number;
}

export interface PdfTileCacheBudget {
  insert(entry: { key: string; bytes: number }): boolean;
  has(key: string): boolean;
  hit(key: string): boolean;
  touch(key: string): void;
  pin(key: string): void;
  unpin(key: string): void;
  remove(key: string): void;
  removeNamespace(prefix: string): void;
  subscribe(listener: (evictedKeys: string[]) => void): () => void;
  stats(): PdfTileCacheStats;
}
```

Use a monotonic access counter and evict the smallest unpinned access value. Reject an insertion only when all existing entries are pinned and the new entry cannot fit.

- [ ] **Step 4: Run focused and reader tests**

Run:

```bash
npm test -- src/features/reader/pdfTileCache.test.ts src/features/reader/PdfViewportTiles.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the cache manager**

```bash
git add apps/desktop/src/features/reader/pdfTileCache.ts apps/desktop/src/features/reader/pdfTileCache.test.ts
git commit -m "feat: add bounded PDF tile cache"
```

### Task 3: Add deterministic visible and prefetch planning

**Files:**
- Modify: `apps/desktop/src/features/reader/viewportTiles.ts`
- Modify: `apps/desktop/src/features/reader/viewportTiles.test.ts`

- [ ] **Step 1: Write failing planner tests**

```ts
it("normalizes zoom to native pinch increments", () => {
  expect(normalizeTileScale(1.023)).toBe(1);
  expect(normalizeTileScale(1.026)).toBe(1.05);
});

it("orders exact visible tiles from the viewport center outward", () => {
  const plan = planViewportTiles({
    pageWidth: 1800,
    pageHeight: 2400,
    viewport: { x: 400, y: 400, width: 900, height: 900 },
    scale: 2,
    zoomDirection: 1,
  });
  expect(plan[0].kind).toBe("visible");
  expect(plan[0].priority).toBeGreaterThan(plan.at(-1)!.priority);
});

it("places adjacent-scale work before the scroll ring only while zooming", () => {
  const base = {
    pageWidth: 1800,
    pageHeight: 2400,
    viewport: { x: 400, y: 400, width: 900, height: 900 },
    scale: 2,
  };
  const priority = (plan: PlannedViewportTile[], kind: PlannedTileKind) =>
    Math.max(...plan.filter((tile) => tile.kind === kind).map((tile) => tile.priority));
  const zoomPlan = planViewportTiles({ ...base, zoomDirection: 1 });
  const scrollPlan = planViewportTiles({ ...base, zoomDirection: 0 });
  expect(priority(zoomPlan, "adjacent")).toBeGreaterThan(priority(zoomPlan, "ring"));
  expect(priority(scrollPlan, "ring")).toBeGreaterThan(priority(scrollPlan, "adjacent"));
});
```

- [ ] **Step 2: Run the planner tests and confirm red**

Run: `npm test -- src/features/reader/viewportTiles.test.ts`

Expected: FAIL because normalization and prioritized planning are missing.

- [ ] **Step 3: Implement the planner**

Change `HIGH_ZOOM_TILE_SIZE` from 768 to 512. Add:

```ts
export type PlannedTileKind = "visible" | "adjacent" | "ring";
export interface PlannedViewportTile extends ViewportTile {
  scale: number;
  kind: PlannedTileKind;
  priority: number;
}

export function normalizeTileScale(scale: number): number {
  return Math.round(scale / 0.05) * 0.05;
}
```

Generate exact visible tiles without padding, add the one-tile ring without duplicates, derive the adjacent scale from `zoomDirection`, and sort visible work by squared distance from tile center to viewport center. Use priorities `30` for exact visible, `20/10` for adjacent/ring depending on interaction, and `5` for the last prefetch group.

- [ ] **Step 4: Run the focused tests and confirm green**

Run: `npm test -- src/features/reader/viewportTiles.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the planner**

```bash
git add apps/desktop/src/features/reader/viewportTiles.ts apps/desktop/src/features/reader/viewportTiles.test.ts
git commit -m "feat: plan PDF tile prefetch work"
```

### Task 4: Refactor viewport rendering into persistent per-tile cache entries

**Files:**
- Modify: `apps/desktop/src/features/reader/PdfViewportTiles.tsx`
- Modify: `apps/desktop/src/features/reader/PdfViewportTiles.test.tsx`

- [ ] **Step 1: Write a failing cache-hit test**

Render scale 2, resolve its visible tiles, switch to 3, then return to 2. Assert the scale-2 `page.render` call count does not increase and the cached scale-2 tile is immediately opaque.

```ts
expect(renderCountAtScale(2)).toBe(initialScaleTwoCount);
expect(container.querySelector('[data-tile-scale="2"] .reader-raster-tile'))
  .toHaveStyle({ opacity: "1" });
```

- [ ] **Step 2: Write a failing overlapping-scroll reuse test**

Move the page rectangle by less than one tile, fire scroll, and assert matching tile keys retain the same canvas elements and do not call `page.render` again.

- [ ] **Step 3: Write a failing closest-scale fallback test**

With scale 2 complete and scale 2.05 pending, assert scale 2 stays visible and each completed 2.05 tile fades in independently. Cancel the pending job and assert the scale-2 canvas remains non-zero and visible.

- [ ] **Step 4: Run the component tests and confirm red**

Run: `npm test -- src/features/reader/PdfViewportTiles.test.tsx`

Expected: FAIL because completed generations are currently discarded instead of cached by tile.

- [ ] **Step 5: Implement persistent tile entries**

Replace `TileSetState[]` with entries keyed by:

```ts
interface CachedTileState {
  cacheKey: string;
  namespace: string;
  scale: number;
  tile: ViewportTile;
  kind: PlannedTileKind;
  priority: number;
  ready: boolean;
  bytes: number;
}
```

The plan reconciliation must:

- keep completed entries until LRU eviction;
- remove and cancel incomplete entries no longer present in the plan;
- add only cache misses;
- touch and pin the closest completed fallback and exact visible entries;
- keep adjacent and ring entries hidden until needed;
- render using the planner priority on the existing one-job queue;
- register `canvas.width * canvas.height * 4` only after completion;
- remove evicted entries through the cache subscription;
- fade exact completed tiles over 80 ms without clearing the fallback.

Track target-start time, first exact-tile time, full exact-coverage time, raster-job count, and cache hits. In development, expose the current snapshot through a visually hidden `<output aria-label="PDF tile benchmark metrics">` so the source-app benchmark can read deterministic values without changing the visible reader UI.

- [ ] **Step 6: Run component and queue tests**

Run:

```bash
npm test -- src/features/reader/PdfViewportTiles.test.tsx src/features/reader/pageRenderQueue.test.ts
```

Expected: PASS; no cached scale or overlapping tile rerenders.

- [ ] **Step 7: Commit the renderer integration**

```bash
git add apps/desktop/src/features/reader/PdfViewportTiles.tsx apps/desktop/src/features/reader/PdfViewportTiles.test.tsx
git commit -m "feat: reuse and prefetch PDF viewport tiles"
```

### Task 5: Isolate cache namespaces and page lifecycle

**Files:**
- Modify: `apps/desktop/src/features/reader/ReaderPage.tsx`
- Modify: `apps/desktop/src/features/reader/ReaderPage.test.tsx`
- Modify: `apps/desktop/src/features/reader/PdfViewportTiles.tsx`

- [ ] **Step 1: Write failing document-isolation and unmount tests**

Assert two `ReaderPage` documents with the same page/scale/tile coordinates produce different cache keys. Unmount the visible page and assert its namespace entries are removed and canvas backing dimensions become zero.

- [ ] **Step 2: Run the tests and confirm red**

Run:

```bash
npm test -- src/features/reader/ReaderPage.test.tsx src/features/reader/PdfViewportTiles.test.tsx
```

Expected: FAIL because `PdfViewportTiles` currently has no document namespace lifecycle.

- [ ] **Step 3: Pass and clean up the namespace**

Pass `document.id` from `ReaderPage` through `PdfPage` to `PdfViewportTiles`. Prefix cache keys with `${documentId}:${pageNumber}:`. On page tile-component unmount, remove its namespace entries, unsubscribe from eviction events, cancel in-flight queue tokens, and release backing canvases after DOM detachment.

- [ ] **Step 4: Run reader tests and build**

Run:

```bash
npm test -- src/features/reader/ReaderPage.test.tsx src/features/reader/PdfViewportTiles.test.tsx
npm run build
```

Expected: PASS and TypeScript build exit 0.

- [ ] **Step 5: Commit lifecycle integration**

```bash
git add apps/desktop/src/features/reader/ReaderPage.tsx apps/desktop/src/features/reader/ReaderPage.test.tsx apps/desktop/src/features/reader/PdfViewportTiles.tsx
git commit -m "fix: scope PDF tile cache lifecycle"
```

### Task 6: Benchmark and verify the integrated reader

**Files:**
- Modify: `apps/desktop/tmp/pdf-benchmarks/README.md`
- Modify: `docs/superpowers/plans/2026-07-13-pdf-tile-cache-prefetch.md`

- [ ] **Step 1: Run all automated checks**

Run:

```bash
npm test
npm run build
git diff --check
```

Expected: all Vitest files pass, Vite production build succeeds, and diff check is empty.

- [ ] **Step 2: Confirm the running app is the source binary**

Run:

```bash
pid=$(pgrep -f 'target/debug/library_desktop' | head -n 1)
ps -p "$pid" -o pid=,command=
lsof -a -p "$pid" -d cwd -Fn
```

Expected: `target/debug/library_desktop` with cwd inside `.worktrees/pdf-zoom-render-revision/apps/desktop/src-tauri`; no Applications process.

- [ ] **Step 3: Capture the final benchmark**

Repeat the exact Task 1 scenario with:

```bash
./scripts/sample-reader-resources.sh cached-final 25 "$pid"
```

Record baseline and final mean/peak CPU, peak/settled RSS, cache peak bytes, first-exact-tile latency, full-coverage latency, raster job count, and cache-hit ratio. Confirm the 64 MiB cache and spec thresholds.

- [ ] **Step 4: Visually verify the acceptance path**

On page 225 of `mml-book`, perform rapid zoom, reverse zoom, continuous scroll, and return to previously visited zoom levels. Confirm cached levels are immediately sharp, new exact tiles fade without a whole-page flash, and scrolling into the prefetch ring does not reveal a blank region.

- [ ] **Step 5: Commit benchmark results and verification notes**

```bash
git add apps/desktop/tmp/pdf-benchmarks/README.md docs/superpowers/plans/2026-07-13-pdf-tile-cache-prefetch.md
git commit -m "perf: verify cached PDF tile rendering"
```
