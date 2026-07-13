# Continuous PDF Zoom Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start bounded, visible-region PDF refinement during zoom while avoiding the post-gesture flash and continuous full-page rasterization.

**Architecture:** `ReaderPage` will keep per-input CSS transforms but promote the latest zoom scale to `renderScale` at a fixed 120 ms cadence. The existing 300 ms timer becomes a final exact-scale catch-up. High-zoom `PdfPage` work will continue to use the bounded viewport tile path, while the whole-page preview does not rerasterize for high-scale-only changes.

**Tech Stack:** React, TypeScript, Vitest, PDF.js canvas rendering.

---

### Task 1: Add a deterministic progressive-scale scheduler

**Files:**
- Modify: `apps/desktop/src/features/reader/ReaderPage.tsx:43-50,703-713,763-880`
- Test: `apps/desktop/src/features/reader/ReaderPage.test.tsx`

- [ ] **Step 1: Write the failing reader test**

Add fake-timer coverage that makes three zoom requests inside 120 ms, advances 120 ms, and asserts that the raster render receives the latest requested scale before the 300 ms settle timer.

```ts
it("starts a bounded raster refresh during a sustained zoom gesture", async () => {
  vi.useFakeTimers();
  // Render ReaderPage, issue three zoom clicks, and flush the animation frame.
  // Advancing 120 ms must call pageRender with the latest viewport scale.
  await act(async () => { vi.advanceTimersByTime(120); });
  expect(pageRender).toHaveBeenCalledWith(expect.objectContaining({
    viewport: expect.objectContaining({ width: 240, height: 360 }),
  }));
});
```

- [ ] **Step 2: Run the focused test and confirm red**

Run: `npm test -- ReaderPage.test.tsx`

Expected: FAIL because the current implementation does not call `setRenderScale` until 300 ms after the last zoom input.

- [ ] **Step 3: Add the latest-scale scheduler**

Add these constants and refs beside the existing zoom debounce state:

```ts
const PROGRESSIVE_RENDER_INTERVAL_MS = 120;
const progressiveRenderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const pendingRenderScaleRef = useRef<number | null>(null);
const lastRenderScaleSyncRef = useRef(0);
```

Replace the final-only `scheduleRenderScaleSync` with a callback that stores the newest scale, immediately syncs when 120 ms has elapsed, otherwise schedules one timer for the remaining interval. The timer reads `pendingRenderScaleRef.current`, assigns it to `renderScale`, and records `lastRenderScaleSyncRef.current`. Keep a separate 300 ms final timer that cancels the progressive timer, applies the exact latest scale, and clears `isZoomingRef`.

- [ ] **Step 4: Run the focused test and confirm green**

Run: `npm test -- ReaderPage.test.tsx`

Expected: PASS; the first progressive update occurs after at most 120 ms and uses the newest scale.

- [ ] **Step 5: Commit the scheduler change**

```bash
git add apps/desktop/src/features/reader/ReaderPage.tsx apps/desktop/src/features/reader/ReaderPage.test.tsx
git commit -m "perf: refine PDF tiles during zoom"
```

### Task 2: Avoid redundant full-page preview work at high zoom

**Files:**
- Modify: `apps/desktop/src/features/reader/ReaderPage.tsx:300-467`
- Test: `apps/desktop/src/features/reader/ReaderPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Add a test that changes the high-zoom scale from 200% to 300% and asserts that the whole-page `page.render` preview is not queued twice at scale 1, while the viewport-tile render is scheduled for the newer scale.

```ts
expect(pageRender).toHaveBeenCalledWith(expect.objectContaining({
  viewport: expect.objectContaining({ width: 600, height: 800 }),
}));
expect(pageRender).not.toHaveBeenCalledWith(expect.objectContaining({
  viewport: expect.objectContaining({ width: 1800, height: 2400 }),
}));
```

- [ ] **Step 2: Run the focused test and confirm red**

Run: `npm test -- ReaderPage.test.tsx`

Expected: FAIL because the existing page effect reruns for every `renderScale` change, including high-zoom changes whose preview scale is still 1.

- [ ] **Step 3: Split preview raster dependencies from tile-scale dependencies**

Derive a `previewRenderScale` from `Math.min(renderScale, 1)`. Keep the offscreen whole-page raster effect dependent on `previewRenderScale`; retain `renderScale` for the page's inverse transform and `PdfViewportTiles`. Preserve the current offscreen canvas swap and `hasPreview` behavior so the visible base image is never cleared.

- [ ] **Step 4: Run the focused test and confirm green**

Run: `npm test -- ReaderPage.test.tsx`

Expected: PASS; high-zoom refinement changes only bounded viewport tiles, not the whole-page preview raster.

- [ ] **Step 5: Commit the preview optimization**

```bash
git add apps/desktop/src/features/reader/ReaderPage.tsx apps/desktop/src/features/reader/ReaderPage.test.tsx
git commit -m "perf: keep PDF preview stable during high zoom"
```

### Task 3: Preserve atomic tile presentation across progressive generations

**Files:**
- Modify: `apps/desktop/src/features/reader/PdfViewportTiles.tsx:96-162`
- Test: `apps/desktop/src/features/reader/PdfViewportTiles.test.tsx`

- [ ] **Step 1: Write the failing test**

Add a deferred-render test that creates two tile generations. Resolve every tile from the older generation after the newer scale has become active, then assert that only the newer generation can make `.reader-raster-tiles` opaque.

```ts
expect(view.container.querySelector(".reader-raster-tiles"))
  .toHaveStyle({ opacity: "0" });
// Resolve stale generation tiles.
expect(view.container.querySelector(".reader-raster-tiles"))
  .toHaveStyle({ opacity: "0" });
```

- [ ] **Step 2: Run the focused test and confirm red**

Run: `npm test -- PdfViewportTiles.test.tsx`

Expected: FAIL if a completion from a stale tile set can update the ready set for the active generation.

- [ ] **Step 3: Make tile readiness generation-safe**

Use the existing `tileSetKey` as the generation identifier. On a key change, reset readiness before any child completion is accepted. Ignore `onRendered` completions whose generation key differs from the active key. Keep the overlay transparent until every key in the active set has completed.

- [ ] **Step 4: Run the focused test and confirm green**

Run: `npm test -- PdfViewportTiles.test.tsx`

Expected: PASS; stale work cannot reveal a replacement tile layer.

- [ ] **Step 5: Commit the generation guard**

```bash
git add apps/desktop/src/features/reader/PdfViewportTiles.tsx apps/desktop/src/features/reader/PdfViewportTiles.test.tsx
git commit -m "fix: ignore stale PDF tile generations"
```

### Task 4: Verify the integrated reader behavior

**Files:**
- Modify: `docs/superpowers/specs/2026-07-13-continuous-pdf-zoom-rendering-design.md`
- Modify: `docs/superpowers/plans/2026-07-13-continuous-pdf-zoom-rendering.md`

- [ ] **Step 1: Run the production checks**

Run: `npm run build && npm test`

Expected: TypeScript build succeeds and all test files pass.

- [ ] **Step 2: Run Tauri from this worktree**

Run: `npm run tauri dev`

Expected: Tauri reports `Running target/debug/library_desktop` from `/Users/jason/project/corelib/.worktrees/pdf-zoom-render-revision/apps/desktop`.

- [ ] **Step 3: Manually verify the visual acceptance path**

Open `mml-book`, use Ctrl+wheel or the toolbar to zoom rapidly from 50% to 300%, pause at intermediate levels, then repeat in reverse. Confirm that the visible region refines during sustained zoom, there is no white/blank frame, and the Mac remains responsive.

- [ ] **Step 4: Commit design and verification notes**

```bash
git add docs/superpowers/specs/2026-07-13-continuous-pdf-zoom-rendering-design.md docs/superpowers/plans/2026-07-13-continuous-pdf-zoom-rendering.md
git commit -m "docs: plan continuous PDF zoom rendering"
```
