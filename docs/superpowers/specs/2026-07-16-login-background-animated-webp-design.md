# Login background animated WebP design

## Goal

Replace the account-gate MP4 with a sharp, lightweight animated image that
starts reliably in the macOS Tauri webview without HTML media autoplay policy.

## Decision

Encode the existing 1920×1080, 10-second source as animated WebP at 15 fps and
high visual quality. Render it with an `<img>` rather than a `<video>`.

Animated WebP is chosen over GIF because it preserves full-color imagery at a
much smaller size; it is chosen over the existing MP4 because image animation
does not invoke WKWebView media-playback permission or show a native play
overlay.

## Implementation

- Generate `apps/desktop/public/corelib-login-page-ping-pong.webp` from the
  existing MP4, preserving its 1920×1080 dimensions and 10-second duration.
- Replace the account-gate `<video>` and all playback lifecycle code with an
  `<img>` referencing the WebP asset.
- Keep the existing visual layering, `object-fit: cover`, overlay, and
  accessible hiding of the decorative background.
- Remove obsolete video-specific tests and add a contract test for the
  animated WebP image source and decorative semantics.

## Validation

- The focused account-gate test proves that no `<video>` is rendered and that
  the WebP image is used.
- The full desktop Vitest suite and production build pass.
- Build a fresh Tauri release artifact after the source change, then manually
  verify the exact generated `Library.app` rather than a pre-existing app.
