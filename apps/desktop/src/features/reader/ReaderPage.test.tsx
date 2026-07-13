import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const { pageRender } = vi.hoisted(() => ({
  pageRender: vi.fn().mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() }),
}));

vi.mock("pdfjs-dist", () => {
  const page = {
    getViewport: vi.fn(({ scale }) => ({ width: 200 * scale, height: 300 * scale })),
    render: pageRender,
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
          .mockResolvedValueOnce({ done: true }),
      }),
    }),
    getAnnotations: vi.fn().mockResolvedValue([]),
  };

  return {
    GlobalWorkerOptions: { workerSrc: "" },
    getDocument: vi.fn().mockReturnValue({
      promise: Promise.resolve({
        numPages: 3,
        getPage: vi.fn().mockResolvedValue(page),
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
  // A4 at 3x zoom: dpr 2 would produce a ~17.4MP canvas, above the 16MP budget.
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

it("keeps page observers intact when the visible page changes", async () => {
  const originalIntersectionObserver = globalThis.IntersectionObserver;
  const observers: Array<{
    target: Element | null;
    notify: (isIntersecting: boolean) => void;
  }> = [];

  class ControlledIntersectionObserver {
    target: Element | null = null;
    readonly notify = (isIntersecting: boolean) => {
      if (!this.target) return;
      this.callback(
        [{ isIntersecting, target: this.target } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    };

    constructor(private readonly callback: IntersectionObserverCallback) {
      observers.push(this);
    }

    observe(target: Element) {
      this.target = target;
    }

    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  globalThis.IntersectionObserver = ControlledIntersectionObserver as unknown as typeof IntersectionObserver;
  try {
    render(
      <ReaderPage
        document={document}
        onBack={() => {}}
        getDocumentFileUrl={vi.fn().mockResolvedValue("/mocked/path.pdf")}
        onPageChange={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await waitFor(() => expect(screen.getByText("Page 1 of 3")).toBeInTheDocument());
    await waitFor(() => expect(observers).toHaveLength(6));

    observers.find((observer) => observer.target?.id === "pdf-page-2")?.notify(true);

    await waitFor(() => expect(screen.getByText("Page 2 of 3")).toBeInTheDocument());
    expect(observers).toHaveLength(6);
  } finally {
    globalThis.IntersectionObserver = originalIntersectionObserver;
  }
});

it("keeps visibility updates paused while a rapid zoom settles at the minimum scale", async () => {
  const originalIntersectionObserver = globalThis.IntersectionObserver;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const frameCallbacks: FrameRequestCallback[] = [];
  let pageTwoObserver: { notify: () => void } | undefined;

  class ControlledIntersectionObserver {
    target: Element | null = null;

    constructor(private readonly callback: IntersectionObserverCallback) {}

    observe(target: Element) {
      this.target = target;
      if (target.id === "pdf-page-2") {
        pageTwoObserver = {
          notify: () => this.callback(
            [{ isIntersecting: true, target } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          ),
        };
      }
    }

    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  globalThis.IntersectionObserver = ControlledIntersectionObserver as unknown as typeof IntersectionObserver;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    frameCallbacks.push(callback);
    return frameCallbacks.length;
  }) as typeof globalThis.requestAnimationFrame;
  try {
    render(
      <ReaderPage
        document={document}
        onBack={() => {}}
        getDocumentFileUrl={vi.fn().mockResolvedValue("/mocked/path.pdf")}
        onPageChange={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await waitFor(() => expect(screen.getByText("Page 1 of 3")).toBeInTheDocument());
    const zoomOut = screen.getByRole("button", { name: "Zoom out" });
    for (let index = 0; index < 10; index += 1) fireEvent.click(zoomOut);
    expect(frameCallbacks).toHaveLength(1);

    await act(async () => {
      frameCallbacks.shift()?.(performance.now());
      pageTwoObserver?.notify();
    });

    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  } finally {
    globalThis.IntersectionObserver = originalIntersectionObserver;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  }
});

it("renders the final zoom scale after a fast zoom-out and zoom-in", async () => {
  pageRender.mockClear();
  const requestAnimationFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    queueMicrotask(() => callback(performance.now()));
    return 1;
  }) as typeof globalThis.requestAnimationFrame;
  try {
    render(
      <ReaderPage
        document={document}
        onBack={() => {}}
        getDocumentFileUrl={vi.fn().mockResolvedValue("/mocked/path.pdf")}
        onPageChange={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await waitFor(() => expect(pageRender).toHaveBeenCalled());
    const zoomOut = screen.getByRole("button", { name: "Zoom out" });
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    for (let index = 0; index < 25; index += 1) fireEvent.click(zoomIn);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 350));
    await waitFor(() => expect(globalThis.document.querySelector<HTMLCanvasElement>(".reader-canvas")?.width).toBe(600));

    for (let index = 0; index < 25; index += 1) fireEvent.click(zoomOut);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 350));
    await waitFor(() => expect(globalThis.document.querySelector<HTMLCanvasElement>(".reader-canvas")?.width).toBe(100));

    for (let index = 0; index < 25; index += 1) fireEvent.click(zoomIn);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 350));

    await waitFor(() => expect(globalThis.document.querySelector<HTMLCanvasElement>(".reader-canvas")?.width).toBe(600));
  } finally {
    globalThis.requestAnimationFrame = requestAnimationFrame;
  }
});

it("waits for an in-flight raster before starting the final rapid-zoom raster", async () => {
  const requestAnimationFrame = globalThis.requestAnimationFrame;
  const releases: Array<() => void> = [];
  const fullPageReleases: Array<() => void> = [];
  const fullPageRenderCount = () => pageRender.mock.calls.filter(
    ([options]) => options.viewport.width >= 200,
  ).length;
  pageRender.mockClear();
  pageRender.mockImplementation(({ viewport }) => {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
      releases.push(resolve);
    });
    if (viewport.width >= 200) fullPageReleases.push(release);
    return { promise, cancel: vi.fn() };
  });
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    queueMicrotask(() => callback(performance.now()));
    return 1;
  }) as typeof globalThis.requestAnimationFrame;
  try {
    render(
      <ReaderPage
        document={document}
        onBack={() => {}}
        getDocumentFileUrl={vi.fn().mockResolvedValue("/mocked/path.pdf")}
        onPageChange={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await waitFor(() => expect(fullPageRenderCount()).toBe(1));
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    for (let index = 0; index < 25; index += 1) fireEvent.click(zoomIn);
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(fullPageRenderCount()).toBe(1);

    fullPageReleases.shift()?.();
    await waitFor(() => expect(fullPageRenderCount()).toBe(2));
    fullPageReleases.shift()?.();
    await waitFor(() => expect(globalThis.document.querySelector<HTMLCanvasElement>(".reader-canvas")?.width).toBe(600));
  } finally {
    releases.splice(0).forEach((release) => release());
    pageRender.mockReset().mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() });
    globalThis.requestAnimationFrame = requestAnimationFrame;
  }
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
    expect(onPageChange.mock.calls[0][0]).toBe("linear-algebra");
    expect(onPageChange.mock.calls[0][1]).toBe(1);
  });
});
