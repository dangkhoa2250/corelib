# PDF.js Reader Viewport Tile Design

## Problem

At high zoom the reader rasterizes an entire page. An A4 page at 300% can require a 8–16 million-pixel bitmap, plus an equally large offscreen canvas during swap. This produces a short but noticeable CPU and memory spike after zooming, even when the reader displays only a small portion of the page.

## Scope

At render scales of 150% and above, preserve a low-resolution whole-page preview and overlay sharp PDF.js tiles only for the visible region of each visible page. Tile rendering continues to use the existing single-job queue. The reader UI, zoom range, text selection, annotations, and links remain unchanged.

## Design

Each visible `PdfPage` tracks its visible rectangle relative to the scroll container with a request-animation-frame-throttled scroll handler. It computes a bounded grid of 768 CSS-pixel tiles with a 128-pixel prefetch margin. Tile coordinates are in the existing `renderScale` coordinate system, so the current inverse CSS transform continues to align raster, text, and annotation layers.

At 150% or above, the whole-page canvas is rendered at no more than 100% as the preview. Each active tile has a separate canvas positioned over that preview. PDF.js renders into the tile-sized backing canvas with its `transform` parameter translating the full page viewport into the tile canvas. This limits a high-resolution render allocation to a tile instead of a whole page.

The per-page tile map retains only the active tile grid. A tile that leaves the padded visible region is cancelled if pending and removed after its current task settles. The existing global queue keeps at most one full-resolution PDF.js task active across all pages. A completed tile commits only when its key and page generation are still current; stale tiles cannot overwrite a newer scale or viewport.

At scales below 150%, the reader keeps the present whole-page raster path because a full page is smaller than one or two tiles and tiling would add overhead. Text and annotations still use the full render scale; the low-resolution preview is only a visual fallback under the tile layer.

## Error handling

Expected PDF.js cancellation and superseded queue errors are ignored. Other render failures remain logged in development with page, scale, and tile coordinates. A failed tile leaves the preview visible and does not clear an already completed neighbouring tile.

## Tests

- Unit-test tile-grid calculation for viewport bounds, prefetch margin, page edges, and deterministic keys.
- Reader test: at 300%, a visible viewport schedules tile-sized render canvases rather than a full-page canvas and commits the final tile only after the queue releases it.
- Reader test: at 100%, the existing whole-page render path remains active.
- Keep rapid-zoom, cancellation, and queue concurrency regressions.

## Acceptance criteria

- At 300%, no single high-resolution render canvas is larger than one 768px tile plus its device-pixel-ratio backing store.
- The visible portion of a page becomes sharp after the queued tile finishes, without clearing the low-resolution preview.
- Scrolling or changing zoom cancels obsolete tile work and never starts more than one PDF.js raster task concurrently.
- At 100%, the reader uses the existing whole-page rendering behavior.
