# PDF.js Reader Tile Rendering Design

## Goal

Keep PDF.js as the reader engine while making the visible document area sharp at high zoom without rasterizing off-screen page pixels.

## Problem

The reader currently renders one raster canvas for every visible page. Its 16MP per-page budget reduces the effective device pixel ratio at high zoom, so the entire page becomes soft even though only a small viewport region is visible.

## Design

Each visible `PdfPage` will own two raster layers:

- A low-resolution full-page base canvas, rendered once per page to prevent a blank page while detailed content arrives.
- A transparent high-resolution tile layer, divided into 512 CSS-pixel page-space tiles. Only tiles intersecting the reader viewport plus a one-tile prefetch margin are rendered.

The tile canvas remains page-sized in CSS coordinates but uses a backing store sized for only the active tile density. PDF.js renders each tile into a temporary small canvas using the page viewport and a transform that shifts the tile's page-space origin into that temporary canvas. The completed bitmap is copied to its corresponding location in the tile layer.

## Scheduling and lifecycle

A bounded render queue assigns higher priority to visible tiles than base-layer rendering. When the viewport, zoom, page, or document changes, obsolete queued and active tile renders are cancelled. Completed tiles are keyed by page number, snapped zoom scale, device pixel ratio, and tile index; a matching tile is reused until one of those inputs changes.

The existing text and annotation layers remain vector/DOM layers above both raster canvases, preserving selection and links. The existing CSS-transform zoom remains a fast preview; tile rendering starts after the current zoom debounce settles.

## Centering behavior

The scaled page stack is horizontally centered whenever its scaled width is smaller than the reader viewport, producing equal left and right gutters. Once the scaled page is at least as wide as the viewport, its horizontal origin is zero and the existing pointer-anchored zoom plus horizontal scrolling behavior is unchanged. The centering calculation runs after viewport resize, page-size changes, and each zoom update.

## Limits and failure behavior

Tile backing stores cap their dimension at 2048 device pixels per side and their area at 4MP. This bounds memory and avoids browser canvas allocation failures while keeping a 512 CSS-pixel tile sharp at DPR 3. A failed or cancelled tile is removed from the completed/in-flight set so the next viewport update can retry it; the base layer remains visible underneath.

## Verification

Unit tests will cover tile-grid selection, tile render transforms, priority/cancellation, and invalidation after zoom. Existing reader tests, the frontend production build, and the PDF.js e2e reader flow must pass.
