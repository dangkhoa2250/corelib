import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi, afterEach } from "vitest";
import * as pdfjs from "pdfjs-dist";

import type { LibraryDocument } from "../../domain/document";
import { DocumentCard } from "./DocumentCard";

const document: LibraryDocument = {
  id: "linear-algebra",
  title: "Linear Algebra",
  author: "Gilbert Strang",
  source: "local_managed",
  coverUrl: null,
  indexed: true,
  status: "ready",
  lastReadPage: null,
  numPages: null,
};

test("opens a document when its cover card is clicked", async () => {
  const user = userEvent.setup();
  const onOpen = vi.fn();

  render(<DocumentCard document={document} onOpen={onOpen} />);

  await user.click(screen.getByRole("button", { name: "Open Linear Algebra" }));

  expect(onOpen).toHaveBeenCalledExactlyOnceWith();
  expect(screen.getByText("L")).toBeInTheDocument();
  expect(screen.queryByText("Preparing")).not.toBeInTheDocument();
});

test("shows the document status only when it is non-empty", () => {
  render(<DocumentCard document={{ ...document, status: "processing" }} onOpen={() => {}} />);

  expect(screen.getByText("Preparing")).toBeInTheDocument();
});

test("keeps a failed index visible as a recoverable needs-attention card", () => {
  render(
    <DocumentCard
      document={{ ...document, indexed: false, status: "ready" }}
      onOpen={() => {}}
    />,
  );

  expect(screen.getByText("Needs attention")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open Linear Algebra" })).toBeInTheDocument();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("does not download a cover until its card intersects the viewport", async () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as any);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(null));
  let notifyIntersection!: (isIntersecting: boolean) => void;
  class DeferredIntersectionObserver {
    constructor(callback: IntersectionObserverCallback) {
      notifyIntersection = (isIntersecting) =>
        callback(
          [
            { isIntersecting, target: globalThis.document.body } as unknown as IntersectionObserverEntry,
          ],
          this as unknown as IntersectionObserver,
        );
    }
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal("IntersectionObserver", DeferredIntersectionObserver);
  vi.stubGlobal("ResizeObserver", class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback([{ target, contentRect: { width: 200, height: 280 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  });

  const getDocumentFileUrl = vi.fn().mockResolvedValue("/tmp/offscreen.pdf");
  render(
    <DocumentCard
      document={{ ...document, id: "offscreen-document", title: "Offscreen document" }}
      onOpen={() => {}}
      getDocumentFileUrl={getDocumentFileUrl}
    />,
  );

  expect(getDocumentFileUrl).not.toHaveBeenCalled();
  notifyIntersection(true);
  await waitFor(() => expect(getDocumentFileUrl).toHaveBeenCalledWith("offscreen-document"));
  expect(screen.getByRole("button", { name: "Open Offscreen document" })).toBeInTheDocument();
});

test("renders a cover for an initially visible card when IntersectionObserver has no startup callback", async () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as any);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(null));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 200,
    bottom: 280,
    width: 200,
    height: 280,
    toJSON: () => ({}),
  });
  const requestAnimationFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  }) as typeof globalThis.requestAnimationFrame;
  class SilentIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  }
  vi.stubGlobal("IntersectionObserver", SilentIntersectionObserver);
  vi.stubGlobal("ResizeObserver", class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback([{ target, contentRect: { width: 200, height: 280 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  });

  const getDocumentFileUrl = vi.fn().mockResolvedValue("/tmp/initially-visible.pdf");
  try {
    render(
      <DocumentCard
        document={{ ...document, id: "initially-visible", title: "Initially visible" }}
        onOpen={() => {}}
        getDocumentFileUrl={getDocumentFileUrl}
      />,
    );

    await waitFor(() => expect(getDocumentFileUrl).toHaveBeenCalledWith("initially-visible"));
  } finally {
    globalThis.requestAnimationFrame = requestAnimationFrame;
  }
});

test("renders a dynamic cover at its displayed Retina resolution", async () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ scale: vi.fn() } as any);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(null));
  let notifyIntersection!: (isIntersecting: boolean) => void;
  class DeferredIntersectionObserver {
    constructor(callback: IntersectionObserverCallback) {
      notifyIntersection = (isIntersecting) => callback(
        [{ isIntersecting, target: globalThis.document.body } as unknown as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  }
  class CoverResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback([{ target, contentRect: { width: 200, height: 280 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("IntersectionObserver", DeferredIntersectionObserver);
  vi.stubGlobal("ResizeObserver", CoverResizeObserver);
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });

  const getViewport = vi.fn(({ scale }: { scale: number }) => ({ width: 200 * scale, height: 300 * scale }));
  const renderPage = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }));
  (pdfjs.getDocument as any).mockReturnValue({
    promise: Promise.resolve({ getPage: vi.fn().mockResolvedValue({ getViewport, render: renderPage }) }),
    destroy: vi.fn(),
  });

  const { container } = render(<DocumentCard document={{ ...document, id: "retina-cover" }} onOpen={() => {}} getDocumentFileUrl={vi.fn().mockResolvedValue("/tmp/retina.pdf")} />);
  notifyIntersection(true);

  await waitFor(() => expect(renderPage).toHaveBeenCalled());
  expect(getViewport).toHaveBeenCalledWith({ scale: 1 });
  expect(getViewport).toHaveBeenCalledWith({ scale: 2 });
  expect(container.querySelector("canvas")).toHaveProperty("width", 400);
});

test("re-renders a visible cover when its grid frame grows", async () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as any);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(null));
  let notifyIntersection!: (isIntersecting: boolean) => void;
  let notifyResize!: (width: number, height: number) => void;
  class DeferredIntersectionObserver {
    constructor(callback: IntersectionObserverCallback) {
      notifyIntersection = (isIntersecting) => callback(
        [{ isIntersecting, target: globalThis.document.body } as unknown as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  }
  class DeferredResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {
      notifyResize = (width, height) => this.callback(
        [{ target: globalThis.document.body, contentRect: { width, height } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("IntersectionObserver", DeferredIntersectionObserver);
  vi.stubGlobal("ResizeObserver", DeferredResizeObserver);
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });

  const getViewport = vi.fn(({ scale }: { scale: number }) => ({ width: 200 * scale, height: 300 * scale }));
  const renderPage = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }));
  (pdfjs.getDocument as any).mockReturnValue({
    promise: Promise.resolve({ getPage: vi.fn().mockResolvedValue({ getViewport, render: renderPage }) }),
    destroy: vi.fn(),
  });
  const { container } = render(<DocumentCard document={{ ...document, id: "responsive-cover" }} onOpen={() => {}} getDocumentFileUrl={vi.fn().mockResolvedValue("/tmp/responsive.pdf")} />);

  notifyResize(200, 280);
  notifyIntersection(true);
  await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(1));

  notifyResize(300, 420);
  await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(2));
  expect(getViewport).toHaveBeenCalledWith({ scale: 3 });
  expect(container.querySelector("canvas")).toHaveProperty("width", 600);
});
