# PDF Zoom Compositor Design

## Problem

The latest reader fix keeps the PDF sharp by rasterizing a complete visible page at its true zoom scale. It also turns off PDF.js hardware acceleration and changes the page stack's width and height on every animation-frame zoom update. On a long document, those layout writes force repeated reflow while the CPU prepares the eventual high-resolution raster, making zoom feel noticeably less fluid than Preview.

## Goal

Keep the full-page, non-tiled reader sharp after zoom settles while restoring a compositor-first zoom gesture. The reader must not return to viewport tiles or expose blank / assembled tile transitions.

## Design

Re-enable PDF.js hardware acceleration when opening a document. During a zoom gesture, `ReaderPage` will update only the scale transform, zoom label, and pointer-anchored scroll position on the animation frame. The page-stack dimensions will remain at the last committed render scale, so the browser can composite an existing texture instead of recalculating the complete page column every frame.

When input has been idle for 300 ms, the existing settled-render path promotes the final scale into the page geometry and queues one full-page raster per visible page. The transform then returns to `scale(1)`, preserving the current sharp-render guarantee. The settled layout update is deliberately outside the gesture frame; it is a single reflow rather than a reflow on every wheel event.

## Constraints

- Preserve the one-at-a-time whole-page raster queue and 16 MP canvas budget.
- Preserve Retina-minimum backing density and current text/annotation layers.
- Do not reintroduce tiles, progressive tile overlays, or tile cache code.
- Maintain pointer-anchored zoom and correct page navigation after the final geometry promotion.

## Regression coverage

Add a reader test proving that active zoom updates do not change the page-stack layout dimensions before the debounce settles. The existing test that checks the settled page dimensions and `scale(1)` transform will prove the later promotion still happens.

## Acceptance criteria

- Continuous Ctrl+wheel / pinch zoom only performs compositor-friendly transform updates during the gesture.
- PDF.js opens with hardware acceleration enabled.
- After zoom settles, the page remains a single sharp full-page canvas at the final scale.
- Reader tests and the production build pass.
