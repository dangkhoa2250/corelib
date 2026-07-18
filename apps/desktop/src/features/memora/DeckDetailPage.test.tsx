import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DeckDetailPage } from "./DeckDetailPage";

const defaultProps = {
  createCard: vi.fn(),
  deck: { id: "english", name: "English", description: null, color: null, archived: false },
  decks: [],
  getDeckStatistics: vi.fn().mockResolvedValue({ totalCards: 2, newCards: 1, learningCards: 0, reviewCards: 1, dueCards: 1 }),
  listActiveTags: vi.fn().mockResolvedValue([]),
  moveCards: vi.fn(),
  onBack: vi.fn(),
  onPracticeAll: vi.fn(),
  onStudyDeck: vi.fn(),
  queryDeckCards: vi.fn().mockResolvedValue({ rows: [], total: 2, nextCursor: null }),
  selectedIds: new Set(),
  setCardsSuspended: vi.fn(),
  setSelectedIds: vi.fn(),
  trashCards: vi.fn(),
  updateAndMoveCard: vi.fn(),
};

describe("DeckDetailPage", () => {
  it("uses the card browser header without duplicating statistics", async () => {
    render(<DeckDetailPage {...defaultProps} />);

    expect(await screen.findByRole("heading", { name: "English Card Browser" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review Due" })).toBeInTheDocument();
    expect(screen.queryByText(/New:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Learning:/)).not.toBeInTheDocument();
  });

  it("shows View statistics button when onViewStatistics provided", async () => {
    const onViewStatistics = vi.fn();
    render(<DeckDetailPage {...defaultProps} onViewStatistics={onViewStatistics} />);

    expect(await screen.findByRole("button", { name: /view statistics/i })).toBeInTheDocument();
  });

  it("calls onViewStatistics with deck ID", async () => {
    const user = userEvent.setup();
    const onViewStatistics = vi.fn();
    render(<DeckDetailPage {...defaultProps} onViewStatistics={onViewStatistics} />);

    await user.click(await screen.findByRole("button", { name: /view statistics/i }));

    expect(onViewStatistics).toHaveBeenCalledWith("english");
  });
});
