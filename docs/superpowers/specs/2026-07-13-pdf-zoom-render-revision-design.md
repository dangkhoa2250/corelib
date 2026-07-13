# PDF Zoom Render Revision Design

## Problem

The reader renders a temporary, scaled canvas while a zoom gesture is active. Its toolbar buttons and Ctrl+wheel handler calculate the next zoom from `scaleRef.current`, which is updated only on the next animation frame. Rapid input events therefore repeatedly request the same scale instead of accumulating their deltas. A zoom sequence can leave the canvas rasterized below the visual zoom shown in the reader.

## Scope

Accumulate rapid zoom deltas from the pending animation-frame scale. Preserve the existing 300 ms debounce, pixel budget, zoom anchoring, text layer, annotation layer, and page virtualization.

## Design

`ReaderPage` will add a `zoomBy(delta, pointerX, pointerY)` callback. It reads `pendingZoomRef.current?.scale ?? scaleRef.current` and passes that base plus `delta` to the existing `zoomAtViewportPoint` function.

The toolbar and Ctrl+wheel handler will call `zoomBy`, while `zoomAtViewportPoint` remains responsible for clamping, anchoring, applying the DOM transform, and scheduling the final raster render. The final `renderScale` therefore matches the final visual scale before PDF.js renders the canvas.

## Error handling

The existing cancellation cleanup remains in place. No retry loop, canvas pixel-cap change, or page-virtualization change is part of this fix.

## Regression test

Add a reader-level test that rapidly clicks zoom controls through `300% -> 50% -> 300%` and verifies that the visible canvas has the 300% intrinsic width after the zoom debounce.

## Acceptance criteria

- A rapid `300% -> 50% -> 300%` gesture accumulates all input deltas and renders at 300%.
- The reader remains responsive during the gesture because rendering still waits for the 300 ms debounce.
- Existing reader tests and the production desktop build pass.
