import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CardBrowser } from "./CardBrowser";
import { queryDeckCards } from "../../lib/learning";

vi.mock("../../lib/learning", () => ({
  queryDeckCards: vi.fn(),
  moveCards: vi.fn(),
  setCardsSuspended: vi.fn(),
  trashCards: vi.fn(),
  updateCard: vi.fn(),
  updateAndMoveCard: vi.fn(),
  createCard: vi.fn(),
  listActiveTags: vi.fn().mockResolvedValue([]),
}));

const mockDecks = [
  { id: "d1", name: "Biology", description: null, color: null, archived: false },
  { id: "d2", name: "Chemistry", description: null, color: null, archived: false },
];

const mockRows = [
  {
    id: "c1",
    deckId: "d1",
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
    learningStep: null,
    source: null,
    tags: ["energy"],
    frontLanguage: null,
    createdAt: "2026-07-08T12:00:00Z",
    updatedAt: "2026-07-09T12:00:00Z",
    deletedAt: null,
    deletedFromDeckName: null,
  },
];

describe("CardBrowser component", () => {
  it("delegates dirty back navigation to the route owner without a second confirmation", async () => {
    vi.mocked(queryDeckCards).mockResolvedValue({ rows: [], total: 0, nextCursor: null });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onBack = vi.fn();

    render(
      <CardBrowser
        decks={mockDecks}
        initialDeckId="d1"
        selectedIds={new Set()}
        setSelectedIds={vi.fn()}
        onBack={onBack}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add Card" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Front" }), {
      target: { value: "unsaved question" },
    });
    fireEvent.click(screen.getByRole("button", { name: "← Back" }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("renders headers, queries deck cards, and handles filter updates", async () => {
    vi.mocked(queryDeckCards).mockResolvedValue({
      rows: mockRows,
      total: 1,
      nextCursor: null,
    });

    const setSelectedIds = vi.fn();
    render(
      <CardBrowser
        decks={mockDecks}
        initialDeckId="d1"
        selectedIds={new Set()}
        setSelectedIds={setSelectedIds}
      />
    );

    expect(screen.getByText("Card Browser")).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText("ATP front")).toBeInTheDocument();
      expect(screen.getByText("ATP back")).toBeInTheDocument();
      expect(screen.getAllByText("Biology").length).toBeGreaterThan(0);
    });

    expect(queryDeckCards).toHaveBeenCalledWith({
      deckId: "d1",
      query: "",
      states: [],
      tags: [],
      sort: "updated_desc",
      cursor: null,
      limit: 50,
    });
    expect(screen.queryByRole("option", { name: "All Decks" })).not.toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText("Search front, back, or tags...");
    fireEvent.change(searchInput, { target: { value: "mitochondria" } });

    await waitFor(() => {
      expect(queryDeckCards).toHaveBeenLastCalledWith({
        deckId: "d1",
        query: "mitochondria",
        states: [],
        tags: [],
        sort: "updated_desc",
        cursor: null,
        limit: 50,
      });
    });
  });

  it("renders a supplied deck title and header actions", () => {
    vi.mocked(queryDeckCards).mockResolvedValue({ rows: [], total: 0, nextCursor: null });

    render(
      <CardBrowser
        decks={mockDecks}
        headerActions={<button type="button">Review Due</button>}
        headerTitle="Biology Card Browser"
        initialDeckId="d1"
        selectedIds={new Set()}
        setSelectedIds={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Biology Card Browser" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review Due" })).toBeInTheDocument();
  });

  it("handles bulk operations and side panel editing", async () => {
    vi.mocked(queryDeckCards).mockResolvedValue({
      rows: mockRows,
      total: 1,
      nextCursor: null,
    });

    const setSelectedIds = vi.fn();
    const { rerender } = render(
      <CardBrowser
        decks={mockDecks}
        initialDeckId="d1"
        selectedIds={new Set()}
        setSelectedIds={setSelectedIds}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("ATP front")).toBeInTheDocument();
    });

    rerender(
      <CardBrowser
        decks={mockDecks}
        initialDeckId="d1"
        selectedIds={new Set(["c1"])}
        setSelectedIds={setSelectedIds}
      />
    );

    expect(screen.getByText("1 cards selected")).toBeInTheDocument();

    const row = screen.getByText("ATP front").closest("tr");
    expect(row).toBeInTheDocument();
    fireEvent.doubleClick(row!);

    expect(screen.getByRole("dialog", { name: "Edit Card" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Card front content")).toHaveValue("ATP front");

    fireEvent.click(screen.getByText("✕"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
