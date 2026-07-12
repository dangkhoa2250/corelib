# PDF.js Library Cover Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render dynamic PDF.js Library covers at their visible size and display density so they remain sharp on Retina screens and responsive grids.

**Architecture:** `DynamicCover` observes the rendered cover frame, derives a PDF.js scale from that frame's width, and sizes its backing canvas at the effective device pixel ratio. A size change requests a new cover render only after the card is visible; stale rendering tasks are cancelled before they can publish a bitmap or cache entry.

**Tech Stack:** React 19, TypeScript, PDF.js, Vitest, Testing Library.

---

### Task 1: Test the cover-resolution contract

**Files:**
- Modify: `apps/desktop/src/features/library/DocumentCard.test.tsx`
- Modify: `apps/desktop/src/features/library/DocumentCard.tsx`

- [x] **Step 1: Write the failing test**

Add a test that stubs a 200px-wide cover frame and `window.devicePixelRatio = 2`, intersects the card, and asserts the mocked PDF.js page receives a viewport scale of `400 / 200 = 2` when its scale-one width is 200. Assert its canvas backing store is 400px wide, proving the implementation renders at CSS width × DPR rather than fixed scale `0.15`.

- [x] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- --run src/features/library/DocumentCard.test.tsx`

Expected: FAIL because `DynamicCover` still calls `page.getViewport({ scale: 0.15 })`.

- [x] **Step 3: Implement size-derived rendering**

In `DocumentCard.tsx`, record the observed cover frame size in state. Use `ResizeObserver` to update it and render only when it has a positive width and height. After fetching PDF page one, obtain `page.getViewport({ scale: 1 })`, calculate `scale = (coverWidth * dpr) / baseViewport.width`, render at that scale, and set canvas width/height to the returned PDF viewport dimensions. Set CSS canvas dimensions to the measured cover frame so the output is not stretched by the browser.

- [x] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- --run src/features/library/DocumentCard.test.tsx`

Expected: PASS.

### Task 2: Keep responsive covers current and safe

**Files:**
- Modify: `apps/desktop/src/features/library/DocumentCard.test.tsx`
- Modify: `apps/desktop/src/features/library/DocumentCard.tsx`

- [x] **Step 1: Write the failing resize test**

Extend the test ResizeObserver double to emit an initial 200px frame and then a 300px frame. Assert that a visible dynamic cover invokes `page.getViewport` again with a scale based on 300px × DPR, and that an old render cannot overwrite the newer canvas or cache URL.

- [x] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- --run src/features/library/DocumentCard.test.tsx`

Expected: FAIL because the current dynamic cover does not observe frame geometry or invalidate its fixed-scale render.

- [x] **Step 3: Implement invalidation and cache replacement**

Key the render effect by the measured dimensions. Cancel its loading/render task during cleanup. On a successful replacement render, create a new blob URL, revoke any previous in-memory URL for the document, and replace the entry in `coverCache`; persist the latest generated PNG through `saveCoverApi`.

- [x] **Step 4: Run tests and build**

Run: `npm test -- --run src/features/library/DocumentCard.test.tsx && npm run build:app`

Expected: all focused tests and TypeScript/Vite production build pass.

- [ ] **Step 5: Commit**

Run `git add apps/desktop/src/features/library/DocumentCard.tsx apps/desktop/src/features/library/DocumentCard.test.tsx docs/superpowers/plans/2026-07-13-pdfjs-library-cover-resolution.md` followed by `git commit -m "fix: render PDF.js library covers at display resolution"`.
