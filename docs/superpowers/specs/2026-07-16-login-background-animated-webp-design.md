# Login background MP4 restoration

## Goal

Restore the supplied high-resolution login animation after the animated-WebP
experiment proved visibly softer and slower than the original.

## Decision

Use the supplied `corelib-login-page.mp4` directly: 3328×1872, 30fps, 5
seconds. It preserves the original sharpness and motion cadence.

## Implementation

- Add `apps/desktop/public/corelib-login-page.mp4` from the supplied source
  and remove the former ping-pong MP4.
- Render it as a decorative `<video>` with `autoPlay`, `muted`, `loop`,
  `playsInline`, and `preload="auto"`.
- Keep the existing visual layering, `object-fit: cover`, overlay, and
  accessible hiding of the decorative background.
- The focused contract test asserts the MP4 URL and autoplay-related
  attributes.

## Validation

- Run the focused account-gate test and the production build.
- Build a fresh Tauri release artifact after the source change, then manually
  verify the exact generated `Library.app` rather than a pre-existing app.
