import { createRef } from "react";
import { render, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { createPageRenderQueue } from "./pageRenderQueue";
import { PdfViewportTiles } from "./PdfViewportTiles";

it("renders high-zoom page regions into bounded tile canvases", async () => {
  const renderPage = vi.fn().mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() });
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
    const tiles = Array.from(view.container.querySelectorAll<HTMLCanvasElement>(".reader-raster-tile"));
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((tile) => tile.width <= 768 * 3 && tile.height <= 768 * 3)).toBe(true);
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
