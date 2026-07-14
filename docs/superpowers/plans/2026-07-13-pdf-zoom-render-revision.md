# PDF Zoom Render Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure a PDF page is rasterized again after every settled zoom gesture, including a rapid `300% -> 50% -> 300%` sequence.

**Architecture:** Keep the existing debounced `renderScale` state for canvas resolution and add a separate monotonically increasing `renderRevision`. The debounce increments the revision on every settle. `PdfPage` receives the revision and includes it in both its render effect dependencies and its memo comparator, so a settled zoom always refreshes visible raster, text, and annotation layers without changing page layout.

**Tech Stack:** React 18, TypeScript, pdfjs-dist, Vitest, Testing Library.

---

## File structure

- `apps/desktop/src/features/reader/ReaderPage.tsx` owns zoom settling state and forwards the render invalidation token to each virtualized PDF page.
- `apps/desktop/src/features/reader/ReaderPage.test.tsx` proves a same-scale settled zoom produces a second page render.

### Task 1: Add a failing same-scale zoom refresh regression test

**Files:**

- Modify: `apps/desktop/src/features/reader/ReaderPage.test.tsx:1-80`
- Modify: `apps/desktop/src/features/reader/ReaderPage.test.tsx:134-208`

- [ ] **Step 1: Make the PDF page render spy observable from the test**

  Change the local `pdfjs-dist` mock to retain the first page's `render` spy and expose it through a Vitest-hoisted module-level variable:

  ```ts
  const { pageRender } = vi.hoisted(() => ({
    pageRender: vi.fn().mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() }),
  }));

  vi.mock("pdfjs-dist", () => {
    const page = {
      getViewport: vi.fn().mockReturnValue({ width: 200, height: 300 }),
      render: pageRender,
      getTextContent: vi.fn().mockResolvedValue({ items: [{ str: "match" }, { str: "hello" }] }),
      streamTextContent: vi.fn().mockReturnValue({
        getReader: vi.fn().mockReturnValue({
          read: vi.fn()
            .mockResolvedValueOnce({ value: { items: [{ str: "match" }, { str: "hello" }], styles: {} }, done: false })
            .mockResolvedValueOnce({ done: true }),
        }),
      }),
      getAnnotations: vi.fn().mockResolvedValue([]),
    };

    return {
      GlobalWorkerOptions: { workerSrc: "" },
      getDocument: vi.fn().mockReturnValue({ promise: Promise.resolve({ numPages: 3, getPage: vi.fn().mockResolvedValue(page) }) }),
      TextLayer: vi.fn().mockImplementation(function () { return { render: vi.fn().mockResolvedValue(undefined), cancel: vi.fn() }; }),
      AnnotationLayer: vi.fn().mockImplementation(function () { return { render: vi.fn().mockResolvedValue(undefined) }; }),
    };
  });
  ```

- [ ] **Step 2: Write the regression test before adding production code**

  Change the test-library import to `import { fireEvent, render, screen, waitFor } from "@testing-library/react"`. Render `ReaderPage`, wait until page 1 has performed its initial render, then perform a fast zoom-out and zoom-in sequence that settles at 300% twice. The test uses the real 300 ms debounce so it also exercises the request-animation-frame coalescing used by the reader:

  ```ts
  it("re-renders a visible page when a zoom gesture settles at its existing scale", async () => {
    pageRender.mockClear();
    render(<ReaderPage document={document} onBack={() => {}} getDocumentFileUrl={vi.fn().mockResolvedValue("/mocked/path.pdf")} onPageChange={vi.fn().mockResolvedValue(undefined)} />);

    await waitFor(() => expect(pageRender).toHaveBeenCalled());
    const zoomOut = screen.getByRole("button", { name: "Zoom out" });
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    for (let index = 0; index < 25; index += 1) fireEvent.click(zoomIn);
    await new Promise((resolve) => setTimeout(resolve, 350));
    await waitFor(() => expect(pageRender.mock.calls.length).toBeGreaterThan(1));
    const atThreeHundredPercent = pageRender.mock.calls.length;

    for (let index = 0; index < 25; index += 1) fireEvent.click(zoomOut);
    for (let index = 0; index < 25; index += 1) fireEvent.click(zoomIn);
    await new Promise((resolve) => setTimeout(resolve, 350));

    await waitFor(() => expect(pageRender.mock.calls.length).toBeGreaterThan(atThreeHundredPercent));
  });
  ```

- [ ] **Step 3: Run the focused test and verify red**

  Run:

  ```bash
  npm test -- --run src/features/reader/ReaderPage.test.tsx
  ```

  Expected: the new test fails on the final `toBeGreaterThan(atThreeHundredPercent)` assertion because `renderScale` remains `3` and React does not rerun `PdfPage`.

- [ ] **Step 4: Commit the failing regression test**

  ```bash
  git add apps/desktop/src/features/reader/ReaderPage.test.tsx
  git commit -m "test: cover same-scale PDF zoom refresh"
  ```

### Task 2: Invalidate visible page raster on every settled zoom

**Files:**

- Modify: `apps/desktop/src/features/reader/ReaderPage.tsx:196-219`
- Modify: `apps/desktop/src/features/reader/ReaderPage.tsx:290-429`
- Modify: `apps/desktop/src/features/reader/ReaderPage.tsx:631-634`
- Modify: `apps/desktop/src/features/reader/ReaderPage.tsx:788-795`
- Modify: `apps/desktop/src/features/reader/ReaderPage.tsx:1311-1320`

- [ ] **Step 1: Add `renderRevision` to the page render contract**

  Add a required `renderRevision: number` member to `PdfPageProps`, destructure it in `PdfPage`, then add it to both dependency checks:

  ```ts
  interface PdfPageProps {
    pdfDoc: pdfjs.PDFDocumentProxy;
    pageNumber: number;
    renderScale: number;
    renderRevision: number;
    defaultWidth: number;
    defaultHeight: number;
    pagesContainerRef: React.RefObject<HTMLDivElement | null>;
    onVisible: () => void;
    onSelection: (source: CardSource, focusPage: number) => void;
    highlightRects?: SelectionRect[] | null;
  }

  // The raster effect dependency list
  }, [pdfDoc, pageNumber, renderScale, renderRevision, isVisible]);

  prevProps.pdfDoc === nextProps.pdfDoc &&
  prevProps.pageNumber === nextProps.pageNumber &&
  prevProps.renderScale === nextProps.renderScale &&
  prevProps.renderRevision === nextProps.renderRevision &&
  prevProps.defaultWidth === nextProps.defaultWidth &&
  prevProps.defaultHeight === nextProps.defaultHeight &&
  prevProps.pagesContainerRef === nextProps.pagesContainerRef &&
  prevProps.onSelection === nextProps.onSelection &&
  prevProps.highlightRects === nextProps.highlightRects
  ```

- [ ] **Step 2: Increment the revision whenever the zoom debounce settles**

  Create state alongside `renderScale`, increment it in the existing debounce, and pass it to each `PdfPage`:

  ```ts
  const [renderScale, setRenderScale] = useState(1);
  const [renderRevision, setRenderRevision] = useState(0);

  const scheduleRenderScaleSync = useCallback((newScale: number) => {
    if (zoomDebounceRef.current) clearTimeout(zoomDebounceRef.current);
    zoomDebounceRef.current = setTimeout(() => {
      setRenderScale(newScale);
      setRenderRevision((current) => current + 1);
      isZoomingRef.current = false;
    }, 300);
  }, []);

  <PdfPage
    key={pageNumber}
    pdfDoc={pdfDoc!}
    pageNumber={pageNumber}
    renderScale={renderScale}
    renderRevision={renderRevision}
    defaultWidth={pageSizes?.[pageNumber - 1]?.width ?? defaultSize.width}
    defaultHeight={pageSizes?.[pageNumber - 1]?.height ?? defaultSize.height}
    pagesContainerRef={pagesContainerRef}
    onVisible={() => {
      if (!isZoomingRef.current && !isNavigatingRef.current) {
        setCurrentPage(pageNumber);
        debouncedSavePage(pageNumber);
      }
    }}
    onSelection={handleSelection}
    highlightRects={sourceHighlight?.page === pageNumber ? sourceHighlight.rects : null}
  />
  ```

- [ ] **Step 3: Run the focused test and verify green**

  Run:

  ```bash
  npm test -- --run src/features/reader/ReaderPage.test.tsx
  ```

  Expected: all reader tests pass, including the final same-scale zoom refresh assertion.

- [ ] **Step 4: Run desktop production verification**

  Run:

  ```bash
  npm run build
  npm test -- --run
  ```

  Expected: TypeScript build exits 0 and Vitest reports no failing suites.

- [ ] **Step 5: Manually verify the source app**

  In the `npm run tauri dev` app, open `Learning Theory from First Principles.pdf`, zoom to 300%, zoom rapidly down to 50%, then rapidly back to 300%. Wait at least 300 ms. Confirm text regains sharp edges without restarting the app.

- [ ] **Step 6: Commit the implementation**

  ```bash
  git add apps/desktop/src/features/reader/ReaderPage.tsx apps/desktop/src/features/reader/ReaderPage.test.tsx
  git commit -m "fix: refresh PDF raster after settled zoom"
  ```
