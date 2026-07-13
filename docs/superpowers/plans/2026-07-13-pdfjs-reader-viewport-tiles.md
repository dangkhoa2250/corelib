# PDF.js Reader Viewport Tiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render only high-resolution PDF regions around the viewport at 150%+ zoom while retaining a low-resolution full-page preview.

**Architecture:** A pure helper calculates a padded, bounded grid of page-coordinate tiles. `PdfPage` continues to own visibility, text, links, and low-resolution preview; a tile layer tracks its page-local viewport, submits tile canvases through the existing one-at-a-time queue, and drops stale keys after scroll or zoom.

**Tech Stack:** React 19, TypeScript, PDF.js, Canvas 2D, Vitest, Testing Library.

---

### Task 1: Define the viewport tile grid

**Files:**
- Create: `apps/desktop/src/features/reader/viewportTiles.ts`
- Create: `apps/desktop/src/features/reader/viewportTiles.test.ts`

- [x] **Step 1: Write failing tile-grid tests**

```ts
expect(getViewportTiles({
  pageWidth: 1800, pageHeight: 2400,
  viewport: { x: 760, y: 40, width: 600, height: 700 },
})).toEqual([
  { key: "0:0", x: 0, y: 0, width: 768, height: 768 },
  { key: "1:0", x: 768, y: 0, width: 768, height: 768 },
  { key: "0:1", x: 0, y: 768, width: 768, height: 768 },
  { key: "1:1", x: 768, y: 768, width: 768, height: 768 },
]);
```

Also cover page-edge clipping and a viewport outside the page returning no tiles.

- [x] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- viewportTiles.test.ts`

Expected: FAIL because the helper does not exist.

- [x] **Step 3: Implement `getViewportTiles`**

```ts
export const HIGH_ZOOM_TILE_SIZE = 768;
export const HIGH_ZOOM_TILE_PADDING = 128;
export function getViewportTiles(input: ViewportTileInput): ViewportTile[] {
  // expand by padding, clamp to page bounds, enumerate intersecting 768px cells
}
```

- [x] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- viewportTiles.test.ts`

Expected: PASS.

### Task 2: Add the high-zoom tile layer

**Files:**
- Create: `apps/desktop/src/features/reader/PdfViewportTiles.tsx`
- Modify: `apps/desktop/src/features/reader/ReaderPage.tsx:208-460`
- Modify: `apps/desktop/src/features/reader/pageRenderQueue.ts`

- [x] **Step 1: Write a failing reader test**

At 300%, render the reader with a controlled page viewport and assert that the high-resolution `page.render` call targets a 768px-or-smaller canvas rather than the full page. At 100%, assert the existing full-page call remains selected.

- [x] **Step 2: Run the focused reader test and verify it fails**

Run: `npm test -- ReaderPage.test.tsx`

Expected: FAIL because current `PdfPage` only creates a whole-page raster.

- [x] **Step 3: Implement tile scheduling and rendering**

```tsx
<PdfViewportTiles
  page={page}
  renderScale={renderScale}
  pageWidth={currentWidth}
  pageHeight={currentHeight}
  root={pagesContainerRef.current}
  queue={pageRenderQueue}
/>
```

Render tiles only when `renderScale >= 1.5`. Use a request-animation-frame scroll listener while the page is visible, calculate the page-local visible rectangle from `getBoundingClientRect`, and render each tile with `page.render({ viewport, transform: [dpr, 0, 0, dpr, -tile.x * dpr, -tile.y * dpr] })`. Cancel the tile token and render task on unmount or stale key.

Change the existing whole-page high-zoom render to `previewScale = Math.min(renderScale, 1)` so it remains a low-cost fallback below the overlay tiles.

- [x] **Step 4: Run focused reader tests and verify they pass**

Run: `npm test -- viewportTiles.test.ts ReaderPage.test.tsx pageRenderQueue.test.ts`

Expected: PASS.

### Task 3: Verify the worktree

**Files:**
- Verify only.

- [x] **Step 1: Run all frontend tests**

Run: `npm test`

Expected: all test files pass.

- [x] **Step 2: Build the production frontend**

Run: `npm run build`

Expected: TypeScript and Vite build pass.

- [x] **Step 3: Inspect the diff**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only reader tile files, tests, and design documentation changed.
