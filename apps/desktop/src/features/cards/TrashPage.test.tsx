import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TrashPage } from "./TrashPage";
import { listTrashedCards, emptyTrash } from "../../lib/learning";

vi.mock("../../lib/learning", () => ({
  listTrashedCards: vi.fn(),
  restoreCards: vi.fn(),
  deleteCardsPermanently: vi.fn(),
  emptyTrash: vi.fn(),
}));

const mockDecks = [
  { id: "d1", name: "Biology", description: null, color: null, archived: false },
];

const mockRows = [
  {
    id: "c1",
    deckId: null,
    deckName: "Biology",
    front: "ATP front",
    back: "ATP back",
    state: "review" as const,
    dueAt: "2026-07-10T12:00:00Z",
    reps: 5,
    lapses: 0,
    stability: 2.5,
    difficulty: 3.1,
    lastReviewAt: "2026-07-09T12:00:00Z",
    source: null,
    tags: ["energy"],
    createdAt: "2026-07-08T12:00:00Z",
    updatedAt: "2026-07-09T12:00:00Z",
    deletedAt: "2026-07-11T10:00:00Z",
    deletedFromDeckName: "Biology",
  },
];

describe("TrashPage component", () => {
  it("renders list and triggers search", async () => {
    vi.mocked(listTrashedCards).mockResolvedValue({
      rows: mockRows,
      total: 1,
      nextCursor: null,
    });

    render(<TrashPage decks={mockDecks} />);

    expect(screen.getByText("Trash")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("ATP front")).toBeInTheDocument();
      expect(screen.getByText("Biology")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText("Search front, back, or tags...");
    fireEvent.change(searchInput, { target: { value: "ATP" } });

    await waitFor(() => {
      expect(listTrashedCards).toHaveBeenLastCalledWith("ATP", "deleted_desc", null, 50);
    });
  });

  it("handles empty trash operations", async () => {
    vi.mocked(listTrashedCards).mockResolvedValue({
      rows: mockRows,
      total: 1,
      nextCursor: null,
    });

    render(<TrashPage decks={mockDecks} />);

    await waitFor(() => {
      expect(screen.getByText("Empty Trash")).toBeInTheDocument();
    });

    // Mock window.confirm
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(emptyTrash).mockResolvedValue({ affectedIds: ["c1"], affectedCount: 1 });

    fireEvent.click(screen.getByText("Empty Trash"));

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled();
      expect(emptyTrash).toHaveBeenCalled();
    });

    confirmSpy.mockRestore();
  });
});
