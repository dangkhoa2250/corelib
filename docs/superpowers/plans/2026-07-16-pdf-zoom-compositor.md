# PDF Zoom Compositor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PDF zoom compositor-first during input while retaining a sharp, full-page raster once zoom settles.

**Architecture:** Split the existing zoom DOM work into a gesture path and a settled-layout path. The gesture path changes only the page-column transform, zoom label, and scroll anchor inside `requestAnimationFrame`; the settled path promotes the final scale into the stack/page geometry after the 300 ms debounce and starts the existing serialized full-page PDF.js render. PDF.js will open with hardware acceleration enabled.

**Tech Stack:** React 18, TypeScript, pdfjs-dist, Vitest, Testing Library.

---

## File structure

- `apps/desktop/src/features/reader/ReaderPage.tsx` owns native zoom handling, the temporary transform, settled layout promotion, and the PDF.js load options.
- `apps/desktop/src/features/reader/ReaderPage.test.tsx` proves the stack does not reflow before the debounce and that the PDF document is opened with HWA enabled.

### Task 1: Add failing gesture-layout and HWA regression tests

**Files:**

- Modify: `apps/desktop/src/features/reader/ReaderPage.test.tsx:14-65`
- Modify: `apps/desktop/src/features/reader/ReaderPage.test.tsx:430-485`

- [ ] **Step 1: Expose the PDF.js `getDocument` mock**

  Change the existing Vitest-hoisted state so the test can inspect document-load arguments:

  ```ts
  const { getDocument, pageRender } = vi.hoisted(() => ({
    getDocument: vi.fn(),
    pageRender: vi.fn().mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() }),
  }));
  ```

  In the `pdfjs-dist` mock, replace the inline `getDocument` mock with `getDocument.mockReturnValue({ promise: Promise.resolve(mockPdfDocument) })` and export `getDocument`.

- [ ] **Step 2: Write the failing behavior tests**

  Add these tests immediately before the existing settled-geometry test:

  ```ts
  it("keeps the page stack geometry at its committed scale during an active zoom", async () => {
    const requestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      queueMicrotask(() => callback(performance.now()));
      return 1;
    }) as typeof globalThis.requestAnimationFrame;
    try {
      render(<ReaderPage document={document} onBack={() => {}} getDocumentFileUrl={vi.fn().mockResolvedValue("/mocked/path.pdf")} onPageChange={vi.fn().mockResolvedValue(undefined)} />);
      await waitFor(() => expect(pageRender).toHaveBeenCalled());

      const stack = globalThis.document.querySelector<HTMLElement>(".reader-page-stack")!;
      expect(stack).toHaveStyle({ width: "248px" });
      for (let index = 0; index < 25; index += 1) fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
      await new Promise((resolve) => setTimeout(resolve, 160));

      expect(stack).toHaveStyle({ width: "248px" });
      expect(globalThis.document.querySelector<HTMLElement>(".reader-page-column"))
        .toHaveStyle({ transform: "scale(3)" });
    } finally {
      globalThis.requestAnimationFrame = requestAnimationFrame;
    }
  });

  it("opens PDF.js documents with hardware acceleration enabled", async () => {
    render(<ReaderPage document={document} onBack={() => {}} getDocumentFileUrl={vi.fn().mockResolvedValue("/mocked/path.pdf")} onPageChange={vi.fn().mockResolvedValue(undefined)} />);
    await waitFor(() => expect(getDocument).toHaveBeenCalled());
    expect(getDocument).toHaveBeenCalledWith(expect.objectContaining({ enableHWA: true }));
  });
  ```

- [ ] **Step 3: Run the focused test file and verify red**

  Run:

  ```bash
  npm test -- --run src/features/reader/ReaderPage.test.tsx
  ```

  Expected: the stack assertion reports the active zoom width is `744px`, and the HWA assertion reports `enableHWA: false`.

- [ ] **Step 4: Commit the failing tests**

  ```bash
  git add apps/desktop/src/features/reader/ReaderPage.test.tsx
  git commit -m "test: cover compositor-first PDF zoom"
  ```

### Task 2: Separate gesture transforms from settled geometry

**Files:**

- Modify: `apps/desktop/src/features/reader/ReaderPage.tsx:850-875`
- Modify: `apps/desktop/src/features/reader/ReaderPage.tsx:935-950`
- Modify: `apps/desktop/src/features/reader/ReaderPage.tsx:960-975`

- [ ] **Step 1: Add a gesture-only DOM updater**

  Replace `applyScaleToDOM` with two callbacks. `applyGestureScale` must not write `zoomLayoutRef.current.style.width` or `.height`:

  ```ts
  const applyGestureScale = useCallback((scale: number) => {
    if (scalingDivRef.current) {
      scalingDivRef.current.style.transform = `scale(${scale / renderScale})`;
      const viewportWidth = pagesContainerRef.current?.clientWidth ?? 0;
      const contentWidth = (stackContentSize.width + 48) * scale;
      scalingDivRef.current.style.left = `${getCenteredPageOffset(viewportWidth, contentWidth)}px`;
    }
    if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${Math.round(scale * 100)}%`;
  }, [renderScale, stackContentSize.width]);

  const commitRenderLayout = useCallback((scale: number) => {
    const baseWidth = stackContentSize.width + 48;
    const baseHeight = stackContentSize.height + 48;
    if (zoomLayoutRef.current) {
      zoomLayoutRef.current.style.width = `${baseWidth * scale}px`;
      zoomLayoutRef.current.style.height = `${baseHeight * scale}px`;
    }
    applyGestureScale(scale);
  }, [applyGestureScale, stackContentSize]);
  ```

  Update the layout effect to call `commitRenderLayout(scaleRef.current)`. This is the only location that writes the page-stack dimensions after a zoom begins.

- [ ] **Step 2: Use the compositor-only callback in the animation frame**

  In `zoomAtViewportPoint`, replace `applyScaleToDOM(next.scale)` with `applyGestureScale(next.scale)`. Keep the existing pointer-anchored `scrollLeft` and `scrollTop` assignments and the 300 ms `scheduleRenderScaleSync(next.scale)` call unchanged.

- [ ] **Step 3: Re-enable PDF.js HWA**

  Change document loading to:

  ```ts
  const doc = cached ?? await pdfjs.getDocument({ url: assetUrl, enableHWA: true }).promise;
  ```

- [ ] **Step 4: Run the focused test file and verify green**

  Run:

  ```bash
  npm test -- --run src/features/reader/ReaderPage.test.tsx
  ```

  Expected: the active-gesture stack remains `248px`, HWA is `true`, and the existing settled-geometry test still observes a 600px page at 300% with `scale(1)`.

- [ ] **Step 5: Run the full desktop verification**

  Run:

  ```bash
  npm test
  npm run build
  ```

  Expected: Vitest reports no failed tests and the TypeScript/Vite build exits 0. The known Vite chunk-size warning may remain.

- [ ] **Step 6: Commit the implementation**

  ```bash
  git add apps/desktop/src/features/reader/ReaderPage.tsx apps/desktop/src/features/reader/ReaderPage.test.tsx
  git commit -m "perf: smooth PDF zoom with compositor transforms"
  ```
