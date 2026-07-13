# Continuous PDF Zoom Rendering Design

## Problem

The reader currently applies every zoom gesture with a CSS transform, then waits 300 ms after the last input before changing `renderScale`. This makes zoom interaction light on CPU, but the high-resolution PDF tile work begins only after the gesture ends. The delayed resolution change is visually noticeable as a flash or snap.

## Goal

Refine the visible PDF region while a zoom gesture is in progress. The reader must avoid blank frames and avoid rendering every input frame, which would cause excessive CPU/GPU use and heat.

## Design

Keep CSS transforms as the immediate response to every zoom input. Add a throttled render-scale channel that samples the latest requested zoom scale no more than once every 120 ms. It schedules PDF.js work only for the visible viewport tiles, and a newer sampled scale supersedes queued or in-flight work for an older one.

The last completed raster remains visible while the newer tile set renders. A new tile set becomes visible only after all tiles covering the active viewport are complete. There is therefore no empty or progressively patched frame; resolution follows the gesture in bounded steps instead of waiting for one large final redraw.

The existing 16 MP whole-page cap, 3x device-pixel-ratio cap, 768px tile bound, 128px tile padding, and global one-job render queue remain. The 300 ms timer changes from the only raster trigger to a final catch-up trigger, so the latest scale still renders if a gesture ends between throttle intervals.

## Error handling

Each sampled render carries a generation identifier. Completion for an older generation is discarded. Expected cancellation remains silent; an unexpected PDF.js failure leaves the previously completed preview visible and logs the page, scale, and tile coordinates in development.

## Tests

- Rapid zoom inputs sample at the configured interval rather than scheduling a raster for every input event.
- A later sampled scale supersedes an older pending scale.
- At high zoom, the tile overlay remains hidden until the current viewport tile set completes.
- The final debounce still schedules the exact final scale after a gesture.

## Acceptance criteria

- High-resolution tile work starts during a sustained zoom gesture, not only 300 ms after it ends.
- The visible page never becomes blank and does not flash from low-resolution preview to partially-rendered tiles.
- At most one PDF.js tile render runs at once, and render allocation remains tile-bounded.
- Sustained zooming is rate-limited to roughly 8 renders per second, preventing continuous full-frame rasterization and excessive heat.
