import { render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi, beforeAll } from "vitest";

import type { LibraryDocument } from "../../domain/document";
import {
  clampZoomScale,
  ReaderPage,
  getCanvasPixelRatio,
  getCenteredPageOffset,
  getZoomAnchorScrollPosition,
} from "./ReaderPage";

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    fillRect: () => {},
    clearRect: () => {},
    getImageData: () => {},
    putImageData: () => {},
    createImageData: () => {},
    setTransform: () => {},
    drawImage: () => {},
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fill: () => {},
    scale: () => {},
    translate: () => {},
    rotate: () => {},
    arc: () => {},
    rect: () => {},
  });
});

// Mock pdfjs-dist
vi.mock("pdfjs-dist", () => {
  return {
    GlobalWorkerOptions: { workerSrc: "" },
    getDocument: vi.fn().mockReturnValue({
      promise: Promise.resolve({
        numPages: 3,
        getPage: vi.fn().mockResolvedValue({
          getViewport: vi.fn().mockReturnValue({ width: 200, height: 300 }),
          render: vi.fn().mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() }),
          getTextContent: vi.fn().mockResolvedValue({
            items: [{ str: "match" }, { str: "hello" }],
          }),
          streamTextContent: vi.fn().mockReturnValue({
            getReader: vi.fn().mockReturnValue({
              read: vi.fn()
                .mockResolvedValueOnce({
                  value: {
                    items: [{ str: "match" }, { str: "hello" }],
                    styles: {},
                  },
                  done: false,
                })
                .mockResolvedValueOnce({
                  done: true,
                }),
            }),
          }),
        }),
      }),
    }),
    TextLayer: vi.fn().mockImplementation(function () {
      return {
        render: vi.fn().mockResolvedValue(undefined),
        cancel: vi.fn(),
      };
    }),
    AnnotationLayer: vi.fn().mockImplementation(function () {
      return {
        render: vi.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

const document: LibraryDocument = {
  id: "linear-algebra",
  title: "Linear Algebra",
  author: "Gilbert Strang",
  source: "local_managed" as const,
  coverUrl: null,
  indexed: true,
  status: "ready" as const,
  lastReadPage: 1,
  numPages: null,
};

it("keeps the document point under the pointer while zooming", () => {
  expect(
    getZoomAnchorScrollPosition({
      scrollLeft: 240,
      scrollTop: 360,
      pointerX: 150,
      pointerY: 90,
      previousScale: 1,
      nextScale: 1.5,
    }),
  ).toEqual({ scrollLeft: 435, scrollTop: 585 });
});

it("clamps zoom scales to the supported range", () => {
  expect(clampZoomScale(4)).toBe(3);
  expect(clampZoomScale(0.1)).toBe(0.5);
});

it("caps canvas raster density to avoid unnecessary Retina over-rendering", () => {
  expect(getCanvasPixelRatio(1)).toBe(1);
  expect(getCanvasPixelRatio(2)).toBe(2);
  expect(getCanvasPixelRatio(3)).toBe(3);
});

it("shrinks raster density when zoom x Retina would exceed the canvas pixel budget", () => {
  // A4 at scale 1 fits the budget at full Retina density
  expect(getCanvasPixelRatio(2, 612, 792)).toBe(2);
  // A4 at 3x zoom: dpr 2 would produce a ~17.4MP canvas, above the 16MP budget
  const ratio = getCanvasPixelRatio(2, 612 * 3, 792 * 3);
  expect(ratio).toBeLessThan(2);
  expect(612 * 3 * ratio * (792 * 3 * ratio)).toBeLessThanOrEqual(16_777_216);
  // never collapses below the readability floor
  expect(getCanvasPixelRatio(3, 100_000, 100_000)).toBe(0.25);
});

it("centers the scaled page stack when it is narrower than the reader viewport", () => {
  expect(getCenteredPageOffset(1200, 600)).toBe(300);
  expect(getCenteredPageOffset(600, 1200)).toBe(0);
});

it("renders PDF document and sidebar thumbnails", async () => {
  const getDocumentFileUrl = vi.fn().mockResolvedValue("/mocked/path.pdf");
  const onPageChange = vi.fn().mockResolvedValue(undefined);

  render(
    <ReaderPage
      document={document}
      onBack={() => {}}
      getDocumentFileUrl={getDocumentFileUrl}
      onPageChange={onPageChange}
    />,
  );

  // Starts in loading state
  expect(screen.getByRole("status", { name: "Loading document" })).toBeInTheDocument();

  // Eventually loads and displays the toolbar
  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "Linear Algebra" })).toBeInTheDocument();
  });

  // Verify page indicator
  expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();

  // Verify thumbnails are rendered (3 button tags for 3 pages)
  expect(screen.getByRole("button", { name: "Go to page 1" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Go to page 2" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Go to page 3" })).toBeInTheDocument();

  await waitFor(() => {
    expect(globalThis.document.querySelector(".textLayer")).toHaveStyle({ "--scale-factor": "1" });
  });
});

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

  expect(globalThis.document.querySelector(".reader-sidebar")).toBeInTheDocument();
  expect(globalThis.document.querySelector(".reader-toolbar__title")).toBeInTheDocument();
  expect(globalThis.document.querySelector(".reader-canvas-container")).toHaveClass("reader-canvas-container");
  expect(globalThis.document.querySelector(".reader-page-stack")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Back to Library" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Zoom out" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
});

it("calls onPageChange when page rendering succeeds", async () => {
  const getDocumentFileUrl = vi.fn().mockResolvedValue("/mocked/path.pdf");
  const onPageChange = vi.fn().mockResolvedValue(undefined);

  render(
    <ReaderPage
      document={document}
      onBack={() => {}}
      getDocumentFileUrl={getDocumentFileUrl}
      onPageChange={onPageChange}
    />,
  );

  await waitFor(() => {
    expect(onPageChange).toHaveBeenCalledWith("linear-algebra", 1);
  });
});
