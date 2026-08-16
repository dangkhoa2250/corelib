import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi, beforeAll } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  convertFileSrc: vi.fn((path: string) => path),
}));

vi.mock("../statistics/useActiveTimer", () => ({
  useActiveTimer: vi.fn().mockReturnValue({
    activeMs: 0,
    markActivity: vi.fn(),
    reset: vi.fn(),
    snapshot: vi.fn().mockReturnValue(0),
  }),
}));

import type { LibraryDocument } from "../../domain/document";
import {
  clampZoomScale,
  ReaderPage,
  getCanvasPixelRatio,
  getCenteredPageOffset,
  getZoomAnchorScrollPosition,
  extractSnippets,
  applySearchHighlight,
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

const { getDocument, pageRender } = vi.hoisted(() => ({
  getDocument: vi.fn(),
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

  getDocument.mockReturnValue({
    promise: Promise.resolve({
      numPages: 3,
      getPage: vi.fn().mockResolvedValue(page),
    }),
  });

  return {
    GlobalWorkerOptions: { workerSrc: "" },
    getDocument,
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

it("keeps reader rasters Retina-dense when the WebView reports a 1x pixel ratio", () => {
  expect(getCanvasPixelRatio(1)).toBe(2);
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

it("keeps a page placeholder visible until its first raster frame is ready", async () => {
  const originalIntersectionObserver = globalThis.IntersectionObserver;
  let pageOneObserver: (() => void) | undefined;
  let releaseRaster: (() => void) | undefined;
  pageRender.mockImplementation(() => ({
    promise: new Promise<void>((resolve) => {
      releaseRaster = resolve;
    }),
    cancel: vi.fn(),
  }));

  class ControlledIntersectionObserver {
    constructor(private readonly callback: IntersectionObserverCallback) {}

    observe(target: Element) {
      if (target.id === "pdf-page-1") {
        pageOneObserver = () => this.callback(
          [{ isIntersecting: true, target } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
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

    await waitFor(() => expect(pageOneObserver).toBeDefined());
    await act(async () => pageOneObserver?.());
    await waitFor(() => expect(pageRender).toHaveBeenCalled());

    expect(screen.getByText("Page 1", { exact: true })).toBeInTheDocument();
  } finally {
    releaseRaster?.();
    pageRender.mockReset().mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() });
    globalThis.IntersectionObserver = originalIntersectionObserver;
  }
});

it("keeps a rendered page bitmap during a brief scroll out and back into view", async () => {
  const originalIntersectionObserver = globalThis.IntersectionObserver;
  let pageOneObserver: { notify: (isIntersecting: boolean) => void } | undefined;
  pageRender.mockClear();

  class ControlledIntersectionObserver {
    constructor(private readonly callback: IntersectionObserverCallback) {}

    observe(target: Element) {
      if (target.id !== "pdf-page-1") return;
      pageOneObserver = {
        notify: (isIntersecting) => this.callback(
          [{ isIntersecting, target } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        ),
      };
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

    await waitFor(() => expect(pageOneObserver).toBeDefined());
    await act(async () => pageOneObserver?.notify(true));
    const fullPageRenders = () => pageRender.mock.calls.filter(
      ([options]) => options.viewport.width === 200,
    ).length;
    await waitFor(() => expect(fullPageRenders()).toBe(1));

    await act(async () => pageOneObserver?.notify(false));
    await act(async () => pageOneObserver?.notify(true));

    await waitFor(() => expect(globalThis.document.querySelector<HTMLCanvasElement>(".reader-canvas")?.width).toBe(400));
    expect(fullPageRenders()).toBe(1);
  } finally {
    pageRender.mockReset().mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() });
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

    const zoomOut = await screen.findByRole("button", { name: "Zoom out" });
    const zoomIn = await screen.findByRole("button", { name: "Zoom in" });
    for (let index = 0; index < 25; index += 1) fireEvent.click(zoomIn);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 350));
    await waitFor(() => expect(globalThis.document.querySelector<HTMLCanvasElement>(".reader-canvas")?.width).toBe(1200));

    for (let index = 0; index < 25; index += 1) fireEvent.click(zoomOut);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 350));
    await waitFor(() => expect(globalThis.document.querySelector<HTMLCanvasElement>(".reader-canvas")?.width).toBe(200));

    for (let index = 0; index < 25; index += 1) fireEvent.click(zoomIn);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 350));

    await waitFor(() => expect(globalThis.document.querySelector<HTMLCanvasElement>(".reader-canvas")?.width).toBe(1200));
  } finally {
    globalThis.requestAnimationFrame = requestAnimationFrame;
  }
});

it("renders one full-resolution canvas at high zoom without tile overlays", async () => {
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

    const zoomIn = await screen.findByRole("button", { name: "Zoom in" });
    for (let index = 0; index < 25; index += 1) fireEvent.click(zoomIn);
    await new Promise((resolve) => setTimeout(resolve, 350));

    await waitFor(() => expect(globalThis.document.querySelector<HTMLCanvasElement>(".reader-canvas")?.width).toBe(1200));
    expect(globalThis.document.querySelectorAll(".reader-raster-tile")).toHaveLength(0);
  } finally {
    globalThis.requestAnimationFrame = requestAnimationFrame;
  }
});

it("keeps the page DOM geometry stable while raster resolution catches up", async () => {
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

    const pageContent = await waitFor(() => {
      const el = globalThis.document.querySelector<HTMLElement>("#pdf-page-1 > div");
      expect(el).not.toBeNull();
      return el!;
    });
    expect(pageContent).toHaveStyle({ width: "200px", height: "300px", transform: "none" });

    const zoomIn = await screen.findByRole("button", { name: "Zoom in" });
    for (let index = 0; index < 25; index += 1) fireEvent.click(zoomIn);
    await new Promise((resolve) => setTimeout(resolve, 160));

    expect(pageContent).toHaveStyle({ width: "200px", height: "300px", transform: "none" });
  } finally {
    globalThis.requestAnimationFrame = requestAnimationFrame;
  }
});

it("keeps the page stack geometry at its committed scale during an active zoom", async () => {
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

    const stack = await waitFor(() => {
      const el = globalThis.document.querySelector<HTMLElement>(".reader-page-stack");
      expect(el).not.toBeNull();
      return el!;
    });
    expect(stack).toHaveStyle({ width: "248px" });

    const zoomIn = await screen.findByRole("button", { name: "Zoom in" });
    for (let index = 0; index < 25; index += 1) fireEvent.click(zoomIn);
    await new Promise((resolve) => setTimeout(resolve, 160));

    expect(stack).toHaveStyle({ width: "248px" });
    expect(globalThis.document.querySelector<HTMLElement>(".reader-page-column"))
      .toHaveStyle({ transform: "scale(3)" });
  } finally {
    globalThis.requestAnimationFrame = requestAnimationFrame;
  }
});

it("opens PDF.js documents with hardware acceleration enabled", async () => {
  getDocument.mockClear();
  render(
    <ReaderPage
      document={{ ...document, id: "hardware-accelerated" }}
      onBack={() => {}}
      getDocumentFileUrl={vi.fn().mockResolvedValue("/mocked/path.pdf")}
      onPageChange={vi.fn().mockResolvedValue(undefined)}
    />,
  );

  await waitFor(() => expect(getDocument).toHaveBeenCalled());
  expect(getDocument).toHaveBeenCalledWith(expect.objectContaining({ enableHWA: true }));
});

it("commits settled zoom into the canvas layout instead of a parent transform", async () => {
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

    const zoomIn = await screen.findByRole("button", { name: "Zoom in" });
    for (let index = 0; index < 25; index += 1) fireEvent.click(zoomIn);
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(globalThis.document.querySelector<HTMLElement>(".reader-page-content"))
      .toHaveStyle({ width: "600px", height: "900px", transform: "none" });
    expect(globalThis.document.querySelector<HTMLElement>(".reader-page-column"))
      .toHaveStyle({ transform: "scale(1)" });
  } finally {
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
  expect(screen.getByRole("button", { name: "Reset zoom" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
});

it("resets zoom scale back to 100% when reset zoom button is clicked", async () => {
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

    const zoomIn = await screen.findByRole("button", { name: "Zoom in" });
    const resetZoom = await screen.findByRole("button", { name: "Reset zoom" });

    for (let index = 0; index < 10; index += 1) fireEvent.click(zoomIn);
    await new Promise((resolve) => setTimeout(resolve, 350));
    await waitFor(() => expect(globalThis.document.querySelector<HTMLCanvasElement>(".reader-canvas")?.width).toBe(800));

    fireEvent.click(resetZoom);
    await new Promise((resolve) => setTimeout(resolve, 350));
    await waitFor(() => expect(globalThis.document.querySelector<HTMLCanvasElement>(".reader-canvas")?.width).toBe(400));
  } finally {
    globalThis.requestAnimationFrame = requestAnimationFrame;
  }
});

it("does not force the full document column into a composited transform layer", async () => {
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

  expect(globalThis.document.querySelector(".reader-page-column")).not.toHaveStyle({ willChange: "transform" });
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

it("opens and toggles the card composer when the Memora toolbar button is clicked", async () => {
  const onCreateCard = vi.fn();
  const onCloseComposer = vi.fn();

  const { rerender } = render(
    <ReaderPage
      document={document}
      onBack={() => {}}
      getDocumentFileUrl={vi.fn().mockResolvedValue("/mocked/path.pdf")}
      onPageChange={vi.fn().mockResolvedValue(undefined)}
      onCreateCard={onCreateCard}
      onCloseComposer={onCloseComposer}
    />,
  );

  const memoraBtn = await screen.findByRole("button", { name: "Memora flashcards" });
  expect(memoraBtn).toBeInTheDocument();
  expect(memoraBtn).not.toHaveClass("is-active");

  fireEvent.click(memoraBtn);
  expect(onCreateCard).toHaveBeenCalledWith({
    documentId: "linear-algebra",
    page: 1,
    quote: "",
    rects: [],
  });

  // When composer is open, button has is-active and clicking closes it
  rerender(
    <ReaderPage
      document={document}
      onBack={() => {}}
      getDocumentFileUrl={vi.fn().mockResolvedValue("/mocked/path.pdf")}
      onPageChange={vi.fn().mockResolvedValue(undefined)}
      onCreateCard={onCreateCard}
      onCloseComposer={onCloseComposer}
      composerSource={{ documentId: "linear-algebra", page: 1, quote: "", rects: [] }}
      composerDecks={[]}
      onSaveCard={vi.fn()}
    />,
  );

  const activeMemoraBtn = await screen.findByRole("button", { name: "Memora flashcards" });
  expect(activeMemoraBtn).toHaveClass("is-active");

  fireEvent.click(activeMemoraBtn);
  expect(onCloseComposer).toHaveBeenCalled();
});

it("extracts text snippets around matched query", () => {
  const text = "A quick brown fox jumps over the lazy dog and runs away";
  const snippets = extractSnippets(text, "fox", 2, 10);
  expect(snippets).toHaveLength(1);
  expect(snippets[0]).toContain("fox");
});

it("applies and removes search highlights in textLayer DOM", () => {
  const container = globalThis.document.createElement("div");
  const span1 = globalThis.document.createElement("span");
  span1.textContent = "Vector space and linear transformation";
  container.appendChild(span1);

  applySearchHighlight(container, "Vector");
  const marks = container.querySelectorAll("mark.reader-search-highlight");
  expect(marks).toHaveLength(1);
  expect(marks[0].textContent).toBe("Vector");

  // Clear query
  applySearchHighlight(container, "");
  expect(container.querySelectorAll("mark.reader-search-highlight")).toHaveLength(0);
  expect(span1.textContent).toBe("Vector space and linear transformation");
});

it("performs search, shows macOS Preview secondary bar, sidebar results, and Done button", async () => {
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

  const searchInput = screen.getByPlaceholderText("Search in PDF...");
  fireEvent.change(searchInput, { target: { value: "match" } });
  fireEvent.submit(searchInput.closest("form")!);

  // Secondary search bar and search results should appear after search completes
  await waitFor(() => {
    expect(screen.getByRole("toolbar", { name: "PDF Search Controls" })).toBeInTheDocument();
    expect(screen.getByText("Found on 3 pages")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Page 1, 1 match/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Page 2, 1 match/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Page 3, 1 match/i })).toBeInTheDocument();
  });

  expect(screen.getByText("Sort By:")).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Search Rank" })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Page Order" })).toBeInTheDocument();

  // Switching sort order
  const pageOrderBtn = screen.getByRole("radio", { name: "Page Order" });
  fireEvent.click(pageOrderBtn);
  expect(pageOrderBtn).toHaveClass("is-active");

  const searchRankBtn = screen.getByRole("radio", { name: "Search Rank" });
  fireEvent.click(searchRankBtn);
  expect(searchRankBtn).toHaveClass("is-active");

  // Navigating with Next and Prev buttons
  const nextBtn = screen.getByRole("button", { name: "Next search match" });
  const prevBtn = screen.getByRole("button", { name: "Previous search match" });
  expect(nextBtn).toBeInTheDocument();
  expect(prevBtn).toBeInTheDocument();
  fireEvent.click(nextBtn);
  fireEvent.click(prevBtn);

  // Clicking sidebar result item
  const page2Result = screen.getByRole("button", { name: /Page 2, 1 match/i });
  fireEvent.click(page2Result);

  // Clicking Done button
  const doneBtn = screen.getByRole("button", { name: "Done searching" });
  fireEvent.click(doneBtn);

  // Search bar and search results disappear, returning to standard pages list
  await waitFor(() => {
    expect(screen.queryByRole("toolbar", { name: "PDF Search Controls" })).not.toBeInTheDocument();
  });
  expect(screen.getByRole("button", { name: "Go to page 1" })).toBeInTheDocument();
});
