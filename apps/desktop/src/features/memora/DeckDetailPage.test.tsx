import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeckDetailPage } from "./DeckDetailPage";

describe("DeckDetailPage", () => {
  it("uses the card browser header without duplicating statistics", async () => {
    render(
      <DeckDetailPage
        createCard={vi.fn()}
        deck={{ id: "english", name: "English", description: null, color: null, archived: false }}
        decks={[]}
        getDeckStatistics={vi.fn().mockResolvedValue({ totalCards: 2, newCards: 1, learningCards: 0, reviewCards: 1, dueCards: 1 })}
        listActiveTags={vi.fn().mockResolvedValue([])}
        moveCards={vi.fn()}
        onBack={vi.fn()}
        onPracticeAll={vi.fn()}
        onStudyDeck={vi.fn()}
        queryDeckCards={vi.fn().mockResolvedValue({ rows: [], total: 2, nextCursor: null })}
        selectedIds={new Set()}
        setCardsSuspended={vi.fn()}
        setSelectedIds={vi.fn()}
        trashCards={vi.fn()}
        updateAndMoveCard={vi.fn()}
      />,
    );

    expect(await screen.findByRole("heading", { name: "English Card Browser" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review Due" })).toBeInTheDocument();
    expect(screen.queryByText(/New:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Learning:/)).not.toBeInTheDocument();
  });
});
