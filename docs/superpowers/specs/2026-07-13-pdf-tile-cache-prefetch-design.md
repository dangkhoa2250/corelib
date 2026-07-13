# PDF Tile Cache and Prefetch Design

## Problem

The reader applies zoom immediately with a CSS transform, while PDF.js raster work follows on a serialized queue. A scale-1 page preview therefore becomes visibly soft or aliased during rapid zoom. Scrolling can expose regions whose high-resolution tiles have not rendered yet. Waiting for every tile in a viewport generation avoids patchwork flashes, but keeps the soft preview visible too long on complex vector pages such as page 225 of `math/mml-book.pdf`.

## Goals

- Keep zoom and scrolling responsive without blank, black, or flashing frames.
- Reuse the closest completed raster while the exact zoom level renders.
- Prefetch the most likely next zoom level and the region immediately surrounding the viewport.
- Bound completed tile cache memory to 64 MiB.
- Keep PDF.js raster concurrency at one job to avoid CPU spikes and sustained heat.
- Measure CPU, RSS, cache memory, and time-to-sharpness before and after the change.

## Non-goals

- Caching complete documents or every page in memory.
- Rendering every wheel event at an exact scale.
- Replacing PDF.js or the outer CSS-transform zoom interaction.
- Guaranteeing an exact high-resolution raster on the same frame as an arbitrary zoom input; the closest cached raster is the immediate fallback.

## Chosen approach

Use a byte-accounted LRU cache of completed viewport tile layers. Cache keys contain the document namespace, page number, normalized zoom level, and tile coordinates. Zoom levels are normalized to 0.05 increments, matching the native pinch step and remaining compatible with the 0.1 toolbar step.

Raster tiles use a 512-pixel render-space bound. Smaller tiles complete and become sharp sooner than the current 768-pixel tiles, while the serialized queue prevents concurrent PDF.js work. The cache retains the actual completed canvas layers rather than duplicating them into blobs or image bitmaps.

The cache budget is 64 MiB, calculated as `canvas.width * canvas.height * 4` for every completed cached tile. Visible layers and the layer being replaced are pinned during presentation. LRU eviction removes only unpinned entries and releases their canvas backing stores. One in-flight tile may temporarily exist outside the completed-cache budget; it enters the cache only after completion and eviction.

## Components

### Tile cache budget manager

Create a focused cache module responsible for:

- byte accounting and the 64 MiB limit;
- LRU ordering;
- pin, unpin, touch, insert, and remove operations;
- eviction callbacks that release the associated canvas;
- development-only cache statistics for benchmarks.

The manager is shared by mounted PDF pages so two visible pages cannot each consume an independent 64 MiB cache. Unmounting a page unregisters its entries immediately.

### Viewport tile planner

Extend tile planning to produce three groups:

1. exact-scale tiles intersecting the visible viewport, ordered from the viewport center outward;
2. visible tiles for the adjacent 0.05 zoom level in the current zoom direction;
3. a one-tile ring around the viewport at the current scale for scroll-ahead coverage.

Exact visible tiles always have first priority. During zoom, adjacent-scale tiles precede the scroll ring. When scale is stable and only scroll position changes, scroll-ring tiles precede adjacent-scale work.

Cache hits are touched and never re-rendered. Missing work is submitted to the existing one-job render queue in planner order. A new exact-scale request supersedes queued work that is no longer part of the visible or prefetch plan.

### Presentation

The page DOM remains at scale-1 geometry; the outer page column is still the only visual zoom transform. For each region, the reader displays the closest completed cached scale immediately. Exact-scale tiles render behind the current raster and fade in over 80 ms as each tile completes. A cached layer is not cleared or detached until replacement coverage exists.

Completed older scales remain hidden but reusable until LRU eviction. Zooming back to a cached level therefore requires no PDF.js render. Scroll-ahead tiles remain hidden until their region enters the viewport.

## Data flow

1. Zoom or scroll updates the outer transform or scroll position immediately.
2. The viewport planner derives the normalized target scale, direction, visible rectangle, and prefetch ring.
3. The cache returns the closest completed raster coverage for immediate display.
4. The queue renders missing exact visible tiles, then orders adjacent-scale and scroll-ahead work according to whether zoom or scrolling is active.
5. Each completed exact tile fades in independently. The prior coverage stays beneath it.
6. Completed tiles enter the LRU cache and may evict unpinned least-recently-used entries.
7. The 300 ms zoom settle still requests the exact final normalized level and cancels irrelevant queued prefetch work.

## Failure and cancellation behavior

- Expected PDF.js cancellation is silent and never removes the displayed fallback.
- An unexpected tile failure logs document, page, scale, and coordinates in development, removes the failed in-flight record, and permits a retry after the viewport stabilizes.
- A stale generation cannot publish over a newer target generation.
- Cache eviction never targets pinned visible or transition coverage.
- If the cache cannot admit a completed tile after evicting all unpinned entries, the visible tile remains active but is not retained for later reuse.

## Benchmark method

Use the source-built `target/debug/library_desktop`; never benchmark `/Applications/Library.app`. Run the same scenario before and after implementation:

1. Open page 225 of `math/mml-book.pdf` in the same window size.
2. Let the reader idle for five seconds and record idle CPU and RSS.
3. Perform three rapid cycles of `50% -> 300% -> 50% -> 300%`.
4. At 300%, scroll down and up by five viewport heights.
5. Let the reader settle for five seconds.

Sample the app process tree at 100 ms intervals. Record:

- mean and peak CPU during the interaction;
- peak RSS and settled RSS;
- completed-cache peak bytes;
- time from the final zoom input to the first exact-scale visible tile;
- time from the final zoom input to complete exact-scale viewport coverage;
- number of PDF.js raster jobs and cache-hit ratio.

Store baseline and final values in a small Markdown table in the implementation plan's verification section. The final implementation must meet these acceptance thresholds:

- completed cache never exceeds 64 MiB;
- settled RSS is no more than 72 MiB above the pre-change idle baseline;
- mean interaction CPU does not regress by more than 15% from the pre-change baseline;
- idle CPU returns to within 2 percentage points of its baseline within five seconds;
- the first exact visible tile completes sooner than the current all-tiles presentation path;
- a return to a cached zoom level starts no new visible-tile raster jobs.

## Tests

- Byte accounting and LRU eviction respect the 64 MiB limit.
- Pinned entries survive eviction pressure and become evictable after unpinning.
- Cache hits at a previously completed scale do not enqueue another raster.
- The closest completed scale remains visible until exact coverage arrives.
- Exact visible tiles are ordered center-first.
- Adjacent-scale prefetch precedes scroll-ring prefetch while zooming.
- Scroll-ring prefetch precedes adjacent-scale prefetch while only scrolling.
- Stale, cancelled, and failed jobs cannot clear cached coverage.
- Page unmount releases its cache entries and backing canvases.
- Existing zoom-anchor, continuous-scale, page-selection, thumbnail, and reader tests continue to pass.

## Acceptance criteria

- Rapid zoom shows cached near-resolution content instead of only the scale-1 preview whenever cache coverage exists.
- Scrolling into the prefetched ring does not expose a blank or scale-1-only region.
- Exact tiles appear progressively with an 80 ms fade and without a whole-page flash.
- Returning to a cached zoom level is immediately sharp and schedules no visible rerasterization.
- Cache accounting, CPU, RSS, and recovery meet the benchmark thresholds above.
