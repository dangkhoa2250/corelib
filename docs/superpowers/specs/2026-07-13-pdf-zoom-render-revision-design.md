# PDF Zoom Render Revision Design

## Problem

The reader renders a temporary, scaled canvas while a zoom gesture is active. A rapid sequence such as `300% -> 50% -> 300%` can end at the same `renderScale` state value as an earlier settled render. React then skips the state update, so visible pages retain the temporary low-resolution bitmap.

## Scope

Refresh only visible PDF page canvases after every settled zoom gesture. Preserve the existing 300 ms debounce, pixel budget, zoom anchoring, text layer, annotation layer, and page virtualization.

## Design

`ReaderPage` will maintain a monotonically increasing `renderRevision` state. When the zoom debounce settles, it will set the target `renderScale` and increment `renderRevision`, even when the scale did not change.

`renderRevision` is passed to `PdfPage` and included in its render effect dependencies and memo comparison. A new revision therefore cancels any obsolete render and starts one fresh render for each visible page at the final settled scale.

The revision is not used for layout or zoom geometry. It only invalidates the raster/text/annotation render pipeline.

## Error handling

The existing cancellation cleanup remains in place. A canceled render is superseded by the same page's new revision render; no retry loop or change to the canvas pixel cap is part of this fix.

## Regression test

Add a helper-level test proving a settled zoom request produces a new render revision even when its scale equals the prior settled scale. The reader test suite will also verify the existing zoom bounds and pixel-budget behavior remain intact.

## Acceptance criteria

- A rapid `300% -> 50% -> 300%` gesture causes a final 300% raster refresh.
- The reader remains responsive during the gesture because rendering still waits for the 300 ms debounce.
- Existing reader tests and the production desktop build pass.
