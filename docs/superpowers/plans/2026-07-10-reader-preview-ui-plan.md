# Reader Preview UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the desktop PDF reader to feel like macOS Preview and keep the PDF page stack horizontally centered at every zoom level.

**Architecture:** Keep PDF rendering and interaction logic in `ReaderPage.tsx`, but replace reader-specific inline presentation styles with semantic class names. Add a reader visual system to `tokens.css`; the stage uses a min-width scroll layout and centered inner column so zoom math remains unchanged.

**Tech Stack:** React 19, TypeScript, pdfjs-dist, Vitest, Testing Library, Vite.

---

### Task 1: Add the reader layout contract test

**Files:**
- Modify: `apps/desktop/src/features/reader/ReaderPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Add a test after the existing rendering test that waits for the document and asserts the Preview-like structure and accessible icon controls:

```tsx
it("exposes a Preview-style reader layout and labeled controls", async () => {
  render(
    <ReaderPage
      document={document}
      onBack={() => {}}
      getDocumentFileUrl={vi.fn().mockResolvedValue("/mocked/path.pdf")}
      onPageChange={vi.fn().mockResolvedValue(undefined)}
    />,
  );

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "Linear Algebra" })).toBeInTheDocument();
  });

  expect(document.querySelector(".reader-sidebar")).toBeInTheDocument();
  expect(document.querySelector(".reader-toolbar__title")).toBeInTheDocument();
  expect(document.querySelector(".reader-canvas-container")).toHaveClass("reader-canvas-container");
  expect(document.querySelector(".reader-page-stack")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Back to Library" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Zoom out" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run `npm test -- --run apps/desktop/src/features/reader/ReaderPage.test.tsx` from `apps/desktop`.
Expected: FAIL because the title, page-stack class, and zoom button labels do not yet exist.

- [ ] **Step 3: Commit the failing test**

Run `git add apps/desktop/src/features/reader/ReaderPage.test.tsx && git commit -m "test: define preview reader layout contract"`.

### Task 2: Add shared Preview-style reader tokens and controls

**Files:**
- Modify: `apps/desktop/src/styles/tokens.css`
- Modify: `apps/desktop/src/features/reader/ReaderPage.tsx`

- [ ] **Step 1: Add reader CSS tokens and structural styles**

Add styles for `.reader-page`, `.reader-sidebar`, `.reader-sidebar__tabs`, `.reader-sidebar__tab`, `.reader-thumbnail`, `.reader-toolbar`, `.reader-toolbar__title`, `.reader-toolbar__group`, `.reader-icon-button`, `.reader-page-indicator`, `.reader-search`, `.reader-canvas-container`, `.reader-page-stack`, `.reader-page-column`, and `.reader-pdf-page`. Use a 52px toolbar, 192px sidebar, `#e8e8eb` stage background, 10px radius controls, subtle borders, and focus outlines. The page stack must use `min-width: 100%`, while the page column uses `align-items: center`.

- [ ] **Step 2: Replace sidebar inline presentation with classes**

Keep the existing Pages/Outline state and click behavior, but add the new sidebar classes and make thumbnail buttons use class-driven active styling. Preserve the `aria-label="Go to page N"` labels.

- [ ] **Step 3: Replace toolbar controls with labeled compact controls**

Keep all existing callbacks. Give the back button `reader-icon-button reader-icon-button--back` with `aria-label="Back to Library"`, add `reader-toolbar__title` to the heading, give previous/next buttons `aria-label="Previous page"` and `aria-label="Next page"`, and give zoom buttons `aria-label="Zoom out"` and `aria-label="Zoom in"`. Use text glyphs `‹`, `›`, `−`, and `+` inside the buttons, with visible page/zoom text alongside them.

- [ ] **Step 4: Restyle search without changing behavior**

Give the form `reader-search`, the input `reader-search__input`, and the result controls `reader-search__results`. Keep submit, result count, Next Match, and Searching behavior intact.

- [ ] **Step 5: Run the focused test to verify it passes**

Run `npm test -- --run apps/desktop/src/features/reader/ReaderPage.test.tsx` from `apps/desktop`.
Expected: PASS, including the new layout contract test.

### Task 3: Implement the centered PDF stage

**Files:**
- Modify: `apps/desktop/src/features/reader/ReaderPage.tsx`
- Modify: `apps/desktop/src/styles/tokens.css`

- [ ] **Step 1: Add explicit page-stack and column classes**

On the zoom layout wrapper add `reader-page-stack`; on the transformed flex wrapper add `reader-page-column`; on each PDF page add `reader-pdf-page`. Keep the existing width/height calculation and transform refs so `applyScaleToDOM` and pointer-anchored zoom still use the same coordinate system.

- [ ] **Step 2: Make the stage center pages at base zoom and scroll when zoomed**

Set the stack width to `max(100%, calculatedContentWidth)` via the existing inline calculated width plus CSS `min-width: 100%`. Center the page column with `align-items: center`. Keep `overflow: auto` on the stage, and keep page margins/shadow in `.reader-pdf-page` so the visible white document is centered without changing PDF canvas dimensions.

- [ ] **Step 3: Run reader tests and verify zoom math remains green**

Run `npm test -- --run apps/desktop/src/features/reader/ReaderPage.test.tsx` from `apps/desktop`.
Expected: PASS for zoom anchor, clamping, rendering, persistence, and layout tests.

### Task 4: Full verification and cleanup

**Files:**
- Modify: `apps/desktop/src/features/reader/ReaderPage.tsx`
- Modify: `apps/desktop/src/styles/tokens.css`
- Modify: `apps/desktop/src/features/reader/ReaderPage.test.tsx`

- [ ] **Step 1: Run the complete desktop test suite**

Run `npm test` from `apps/desktop`.
Expected: all Vitest tests pass with zero failures.

- [ ] **Step 2: Run the production build**

Run `npm run build` from `apps/desktop`.
Expected: TypeScript compilation and Vite production build exit successfully.

- [ ] **Step 3: Inspect the diff**

Run `git diff --check` and `git diff --stat`.
Expected: no whitespace errors; only the reader component, reader tokens, test, and plan files are changed.

- [ ] **Step 4: Commit the implementation**

Run `git add apps/desktop/src/features/reader/ReaderPage.tsx apps/desktop/src/styles/tokens.css apps/desktop/src/features/reader/ReaderPage.test.tsx docs/superpowers/plans/2026-07-10-reader-preview-ui-plan.md && git commit -m "feat: refresh pdf reader preview ui"`.
