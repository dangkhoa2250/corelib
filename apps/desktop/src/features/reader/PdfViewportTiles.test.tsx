import { createRef } from "react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { createPageRenderQueue } from "./pageRenderQueue";
import { createPdfTileCacheBudget } from "./pdfTileCache";
import { PdfViewportTiles } from "./PdfViewportTiles";

it("renders high-zoom page regions into bounded tile canvases", async () => {
  const renderPage = vi.fn((_options: { background?: string }) => ({ promise: Promise.resolve(), cancel: vi.fn() }));
  const page = {
    getViewport: vi.fn(() => ({ width: 1800, height: 2400 })),
    render: renderPage,
  };
  const rootRef = createRef<HTMLDivElement>();
  const pageRef = createRef<HTMLDivElement>();
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
  const canvasContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this === rootRef.current) return { left: 0, top: 0, right: 600, bottom: 700, width: 600, height: 700 } as DOMRect;
    if (this === pageRef.current) return { left: 0, top: 0, right: 1800, bottom: 2400, width: 1800, height: 2400 } as DOMRect;
    return originalGetBoundingClientRect.call(this);
  };

  try {
    const view = render(
      <div ref={rootRef}>
        <div ref={pageRef}>
          <PdfViewportTiles
            page={page as any}
            pageWidth={600}
            pageHeight={800}
            renderScale={3}
            pageContainerRef={pageRef}
            rootRef={rootRef}
            queue={createPageRenderQueue({ concurrency: 1 })}
          />
        </div>
      </div>,
    );

    await waitFor(() => expect(renderPage).toHaveBeenCalled());
    expect(renderPage.mock.calls[0]?.[0]).toMatchObject({ background: "#ffffff" });
    const tiles = Array.from(view.container.querySelectorAll<HTMLCanvasElement>(".reader-raster-tile"));
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((tile) => tile.width <= 512 * 3 && tile.height <= 512 * 3)).toBe(true);
  } finally {
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    canvasContext.mockRestore();
  }
});

it("does not create high-resolution tiles below the high-zoom threshold", () => {
  const pageRef = createRef<HTMLDivElement>();
  const rootRef = createRef<HTMLDivElement>();
  const { container } = render(
    <PdfViewportTiles
      page={{} as any}
      pageWidth={600}
      pageHeight={800}
      renderScale={1}
      pageContainerRef={pageRef}
      rootRef={rootRef}
      queue={createPageRenderQueue({ concurrency: 1 })}
    />,
  );

  expect(container.querySelectorAll(".reader-raster-tile")).toHaveLength(0);
});

it("keeps matching tiles mounted while scrolling within the same tile grid", async () => {
  const renderPage = vi.fn().mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() });
  const page = {
    getViewport: vi.fn(() => ({ width: 1800, height: 2400 })),
    render: renderPage,
  };
  const rootRef = createRef<HTMLDivElement>();
  const pageRef = createRef<HTMLDivElement>();
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
  const canvasContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  let pageLeft = 0;
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this === rootRef.current) return { left: 0, top: 0, right: 600, bottom: 700, width: 600, height: 700 } as DOMRect;
    if (this === pageRef.current) return { left: pageLeft, top: 0, right: pageLeft + 1800, bottom: 2400, width: 1800, height: 2400 } as DOMRect;
    return originalGetBoundingClientRect.call(this);
  };

  try {
    render(
      <div ref={rootRef}>
        <div ref={pageRef}>
          <PdfViewportTiles
            page={page as any}
            pageWidth={600}
            pageHeight={800}
            renderScale={3}
            pageContainerRef={pageRef}
            rootRef={rootRef}
            queue={createPageRenderQueue({ concurrency: 1 })}
          />
        </div>
      </div>,
    );

    await waitFor(() => expect(renderPage).toHaveBeenCalled());
    const initialRenderCount = renderPage.mock.calls.length;
    pageLeft = -10;
    fireEvent.scroll(rootRef.current!);
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(renderPage).toHaveBeenCalledTimes(initialRenderCount);
  } finally {
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    canvasContext.mockRestore();
  }
});

it("reveals each completed tile without waiting for the entire viewport set", async () => {
  const pendingRenders: Array<{ resolve: () => void }> = [];
  const renderPage = vi.fn(() => {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    pendingRenders.push({ resolve });
    return { promise, cancel: vi.fn() };
  });
  const page = {
    getViewport: vi.fn(() => ({ width: 1800, height: 2400 })),
    render: renderPage,
  };
  const rootRef = createRef<HTMLDivElement>();
  const pageRef = createRef<HTMLDivElement>();
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
  const canvasContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this === rootRef.current) return { left: 0, top: 0, right: 1400, bottom: 1400, width: 1400, height: 1400 } as DOMRect;
    if (this === pageRef.current) return { left: 0, top: 0, right: 1800, bottom: 2400, width: 1800, height: 2400 } as DOMRect;
    return originalGetBoundingClientRect.call(this);
  };

  try {
    const view = render(
      <div ref={rootRef}>
        <div ref={pageRef}>
          <PdfViewportTiles
            page={page as any}
            pageWidth={600}
            pageHeight={800}
            renderScale={3}
            pageContainerRef={pageRef}
            rootRef={rootRef}
            queue={createPageRenderQueue({ concurrency: 1 })}
          />
        </div>
      </div>,
    );

    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(1));
    const tileCanvases = Array.from(view.container.querySelectorAll<HTMLElement>(".reader-raster-tile"));
    pendingRenders[0].resolve();
    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(2));

    expect(tileCanvases[0]).toHaveStyle({ opacity: "1" });
    expect(tileCanvases.slice(1).every((tile) => tile.style.opacity === "0")).toBe(true);
  } finally {
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    canvasContext.mockRestore();
  }
});

it("keeps the completed tile set visible until the next scale is fully rendered", async () => {
  const pendingRenders: Array<{ resolve: () => void }> = [];
  const renderPage = vi.fn((_options: { viewport: { width: number } }) => {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    pendingRenders.push({ resolve });
    return { promise, cancel: vi.fn() };
  });
  const page = {
    getViewport: vi.fn(({ scale }) => ({ width: 600 * scale, height: 800 * scale })),
    render: renderPage,
  };
  const rootRef = createRef<HTMLDivElement>();
  const pageRef = createRef<HTMLDivElement>();
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
  const canvasContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this === rootRef.current) return { left: 0, top: 0, right: 600, bottom: 700, width: 600, height: 700 } as DOMRect;
    if (this === pageRef.current) return { left: 0, top: 0, right: 1800, bottom: 2400, width: 1800, height: 2400 } as DOMRect;
    return originalGetBoundingClientRect.call(this);
  };

  try {
    const queue = createPageRenderQueue({ concurrency: 64 });
    const view = render(
      <div ref={rootRef}>
        <div ref={pageRef}>
          <PdfViewportTiles
            page={page as any}
            pageWidth={600}
            pageHeight={800}
            renderScale={3}
            pageContainerRef={pageRef}
            rootRef={rootRef}
            queue={queue}
          />
        </div>
      </div>,
    );

    await waitFor(() => expect(pendingRenders.length).toBeGreaterThan(4));
    pendingRenders.splice(0).forEach(({ resolve }) => resolve());
    await waitFor(() => expect(
      view.container.querySelector<HTMLCanvasElement>('[data-render-scale="3"]'),
    ).toHaveStyle({ opacity: "1" }));
    const completedScaleThreeRenders = renderPage.mock.calls.filter(
      ([options]) => options.viewport.width === 1800,
    ).length;

    view.rerender(
      <div ref={rootRef}>
        <div ref={pageRef}>
          <PdfViewportTiles
            page={page as any}
            pageWidth={600}
            pageHeight={800}
            renderScale={2}
            pageContainerRef={pageRef}
            rootRef={rootRef}
            queue={queue}
          />
        </div>
      </div>,
    );

    await waitFor(() => expect(renderPage.mock.calls.some(
      ([options]) => options.viewport.width === 1200,
    )).toBe(true));
    const fallbackTiles = Array.from(
      view.container.querySelectorAll<HTMLCanvasElement>('.reader-raster-tile:not([data-render-scale="2"])'),
    );
    const pendingTargetTiles = Array.from(
      view.container.querySelectorAll<HTMLCanvasElement>('[data-render-scale="2"]'),
    );
    expect(fallbackTiles.some((tile) => tile.style.opacity === "1")).toBe(true);
    expect(pendingTargetTiles.every((tile) => tile.style.opacity === "0")).toBe(true);
    expect(renderPage.mock.calls.filter(
      ([options]) => options.viewport.width === 1800,
    )).toHaveLength(completedScaleThreeRenders);
  } finally {
    pendingRenders.splice(0).forEach(({ resolve }) => resolve());
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    canvasContext.mockRestore();
  }
});

it("reuses completed tiles when returning to a cached zoom scale", async () => {
  const renderPage = vi.fn((_options: { viewport: { width: number } }) => ({
    promise: Promise.resolve(),
    cancel: vi.fn(),
  }));
  const page = {
    getViewport: vi.fn(({ scale }) => ({ width: 600 * scale, height: 800 * scale })),
    render: renderPage,
  };
  const rootRef = createRef<HTMLDivElement>();
  const pageRef = createRef<HTMLDivElement>();
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
  const canvasContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this === rootRef.current) return { left: 0, top: 0, right: 600, bottom: 700, width: 600, height: 700 } as DOMRect;
    if (this === pageRef.current) return { left: 0, top: 0, right: 1800, bottom: 2400, width: 1800, height: 2400 } as DOMRect;
    return originalGetBoundingClientRect.call(this);
  };

  try {
    const queue = createPageRenderQueue({ concurrency: 8 });
    const renderTiles = (scale: number) => (
      <div ref={rootRef}>
        <div ref={pageRef}>
          <PdfViewportTiles
            page={page as any}
            pageWidth={600}
            pageHeight={800}
            renderScale={scale}
            pageContainerRef={pageRef}
            rootRef={rootRef}
            queue={queue}
          />
        </div>
      </div>
    );
    const view = render(renderTiles(3));

    await waitFor(() => expect(renderPage.mock.calls.some(
      ([options]) => options.viewport.width === 1800,
    )).toBe(true));
    const initialScaleThreeRenders = renderPage.mock.calls.filter(
      ([options]) => options.viewport.width === 1800,
    ).length;

    view.rerender(renderTiles(2));
    await waitFor(() => expect(renderPage.mock.calls.some(
      ([options]) => options.viewport.width === 1200,
    )).toBe(true));
    view.rerender(renderTiles(3));
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(renderPage.mock.calls.filter(
      ([options]) => options.viewport.width === 1800,
    )).toHaveLength(initialScaleThreeRenders);
  } finally {
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    canvasContext.mockRestore();
  }
});

it("scopes cached canvases to the document page and releases them on unmount", async () => {
  const cacheBudget = createPdfTileCacheBudget(16 * 1024 * 1024);
  const page = {
    getViewport: vi.fn(({ scale }) => ({ width: 600 * scale, height: 800 * scale })),
    render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
  };
  const rootRef = createRef<HTMLDivElement>();
  const pageRef = createRef<HTMLDivElement>();
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
  const canvasContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this === rootRef.current) return { left: 0, top: 0, right: 600, bottom: 700, width: 600, height: 700 } as DOMRect;
    if (this === pageRef.current) return { left: 0, top: 0, right: 1800, bottom: 2400, width: 1800, height: 2400 } as DOMRect;
    return originalGetBoundingClientRect.call(this);
  };

  try {
    const view = render(
      <div ref={rootRef}>
        <div ref={pageRef}>
          <PdfViewportTiles
            page={page as any}
            pageWidth={600}
            pageHeight={800}
            renderScale={3}
            pageContainerRef={pageRef}
            rootRef={rootRef}
            queue={createPageRenderQueue({ concurrency: 16 })}
            cacheNamespace="document-a:1"
            cacheBudget={cacheBudget}
          />
        </div>
      </div>,
    );

    await waitFor(() => expect(cacheBudget.stats().entries).toBeGreaterThan(0));
    const canvases = Array.from(view.container.querySelectorAll<HTMLCanvasElement>(".reader-raster-tile"));
    expect(canvases[0]?.dataset.cacheKey).toMatch(/^document-a:1:/);
    const metrics = JSON.parse(
      view.container.querySelector('[aria-label="PDF tile benchmark metrics"]')?.textContent ?? "{}",
    );
    expect(metrics).toMatchObject({ targetScale: 3 });

    view.unmount();

    expect(cacheBudget.stats().entries).toBe(0);
    expect(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  } finally {
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    canvasContext.mockRestore();
  }
});
