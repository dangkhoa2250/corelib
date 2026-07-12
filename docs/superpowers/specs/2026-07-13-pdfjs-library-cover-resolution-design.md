# PDF.js Library Cover Resolution Design

## Goal

Keep PDF.js as the only reader renderer and make dynamically generated Library covers sharp at their displayed size, including on Retina displays and after the document grid resizes.

## Current problem

`DynamicCover` renders page one at a fixed PDF scale of `0.15`. A typical A4 page therefore produces an approximately 90px-wide bitmap, while the Library card can display it substantially larger. CSS stretches that bitmap, causing a blurred cover.

## Design

`DynamicCover` will measure its cover container and request a PDF.js viewport whose width matches the rendered CSS width. Its canvas backing store will be sized at that viewport multiplied by the device pixel ratio.

A `ResizeObserver` will track the cover container. A meaningful size change invalidates the prior rendering and requests a new one at the new target size. The existing intersection observer remains the gate that prevents off-screen cards from opening and rendering PDFs.

The generated blob URL cache remains keyed by document id. A resized cover replaces the cached URL only after its new render completes; the previous URL is revoked to avoid retaining stale blob memory.

## Error handling

Cancelled renders and unmounts do not update state or the cache. A missing or zero-size container waits for a later resize rather than rendering an arbitrary low-resolution bitmap.

## Verification

Tests will cover the computed scale/backing-store dimensions for a Retina cover, render gating while off-screen, and invalidation after a cover resize. The desktop frontend build must pass.
