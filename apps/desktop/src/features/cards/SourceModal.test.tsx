import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SourceModal } from "./SourceModal";

vi.mock("./SourceViewer", () => ({
  SourceViewer: ({ source, onClose }: any) => (
    <div data-testid="source-viewer-mock">
      <span>Page {source.page}</span>
      <button type="button" onClick={onClose}>Close Viewer</button>
    </div>
  ),
}));

describe("SourceModal", () => {
  const mockSource = {
    documentId: "doc-123",
    page: 5,
    quote: "important quote",
    rects: [],
  };

  it("renders the dialog with backdrop and source viewer", () => {
    const onClose = vi.fn();
    render(
      <SourceModal
        source={mockSource}
        getDocumentFileUrl={vi.fn().mockResolvedValue("/path/to/doc.pdf")}
        onClose={onClose}
      />
    );

    expect(screen.getByRole("dialog", { name: "Card source PDF" })).toBeInTheDocument();
    expect(screen.getByTestId("source-viewer-mock")).toBeInTheDocument();
    expect(screen.getByText("Page 5")).toBeInTheDocument();
  });

  it("closes when clicking the backdrop", () => {
    const onClose = vi.fn();
    render(
      <SourceModal
        source={mockSource}
        getDocumentFileUrl={vi.fn().mockResolvedValue("/path/to/doc.pdf")}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByTestId("source-modal-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when pressing Escape key", () => {
    const onClose = vi.fn();
    render(
      <SourceModal
        source={mockSource}
        getDocumentFileUrl={vi.fn().mockResolvedValue("/path/to/doc.pdf")}
        onClose={onClose}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
