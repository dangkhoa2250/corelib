import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi, afterEach } from "vitest";

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
});

test("does not download a cover until its card intersects the viewport", async () => {
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
