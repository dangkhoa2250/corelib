# PDF.js Reader Render Queue Design

## Problem

At 300% zoom, the reader rasterizes a full page into a temporary offscreen canvas and then copies it into the visible canvas. Rapid `300% -> 50% -> 300%` zoom changes can start several of these high-resolution PDF.js jobs at once. The current reader has no concurrency limit, and its render error handler discards all failures. Under memory or worker pressure, the final 300% job can fail or be delayed while the stretched low-resolution preview remains on screen.

## Scope

Serialize full-resolution page raster jobs for the PDF.js reader. Cancel queued work that has become stale, retain the previous bitmap until a newer raster succeeds, and surface non-cancellation render errors in the development console. This does not change supported zoom levels, canvas pixel limits, or the visual UI.

## Design

Add a reader-local render queue with a concurrency of one. A `PdfPage` submits its PDF.js `page.render(...).promise` through the queue only after it is visible. The queue orders jobs by visibility priority and rejects a queued job immediately when its page effect is cleaned up before the job starts.

The render task and offscreen canvas are created inside the queued job. Cleanup marks the page generation stale, cancels an already-started PDF.js render task, supersedes its queued token, and releases any temporary canvas. A successful current-generation task copies its bitmap into the visible canvas, then releases the temporary canvas. Consequently, a stale or failed job cannot overwrite the latest raster.

Expected PDF.js cancellation exceptions are ignored. Any other failure is logged with page and scale in development so future rendering faults are observable instead of silently leaving a stretched preview.

## Tests

- Unit-test the queue: one job runs at a time, a superseded queued job never starts, and a high-priority visible job is selected before low-priority work.
- Add a reader regression test using deferred render tasks: after a rapid zoom sequence, only the final 300% task may commit a bitmap to the visible canvas.
- Keep the existing rapid zoom and minimum-scale visibility regression tests.

## Acceptance criteria

- A rapid `300% -> 50% -> 300%` gesture cannot run multiple full-resolution PDF.js page raster tasks simultaneously.
- The final 300% raster commits after earlier jobs are cancelled or discarded, so the page becomes sharp without reopening the app.
- During a rerender, the last completed canvas remains visible rather than flashing blank.
- Unit tests and the production desktop build pass.
