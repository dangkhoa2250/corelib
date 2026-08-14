import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { MemoraPage } from "./MemoraPage";

const englishDeck = {
  id: "english",
  name: "English",
  description: "General vocabulary",
  color: null,
  archived: false,
};

function renderMemora(overrides: Partial<ComponentProps<typeof MemoraPage>> = {}) {
  const onOpenDeck = vi.fn();
  const onStudyDeck = vi.fn();
  const onPracticeAll = vi.fn();

  const defaults: ComponentProps<typeof MemoraPage> = {
    countDeckCards: vi.fn().mockResolvedValue(4),
    createDeck: vi.fn(),
    deleteDeck: vi.fn(),
    getDeckStatistics: vi.fn().mockResolvedValue({
      totalCards: 4,
      newCards: 1,
      learningCards: 1,
      reviewCards: 1,
      dueCards: 0,
    }),
    getDeckLearningSettings: vi.fn().mockResolvedValue({
      deckId: "english",
      inheritedNewCardsPerDay: 20,
      newCardsPerDay: null,
      effectiveNewCardsPerDay: 20,
    }),
    updateDeckLearningSettings: vi.fn().mockResolvedValue({
      deckId: "english",
      inheritedNewCardsPerDay: 20,
      newCardsPerDay: null,
      effectiveNewCardsPerDay: 20,
    }),
    listDecks: vi.fn().mockResolvedValue([englishDeck]),
    getStudyReadyCounts: vi.fn().mockResolvedValue({ learning: 0, review: 2, new: 0, total: 2 }),
    onOpenDeck,
    onPracticeAll,
    onReviewToday: vi.fn(),
    onStudyDeck,
    renameDeck: vi.fn(),
  };

  render(<MemoraPage {...defaults} {...overrides} />);

  return { onOpenDeck, onPracticeAll, onStudyDeck };
}

describe("MemoraPage", () => {
  it("opens a deck when its row is clicked", async () => {
    const { onOpenDeck } = renderMemora();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "English" }));

    expect(onOpenDeck).toHaveBeenCalledWith(englishDeck);
  });

  it("keeps Study actions scoped to its deck", async () => {
    const { onOpenDeck, onStudyDeck } = renderMemora();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Study English" }));
    await user.click(screen.getByRole("menuitem", { name: "Review Due" }));

    expect(onStudyDeck).toHaveBeenCalledWith("english");
    expect(onOpenDeck).not.toHaveBeenCalled();
  });

  it("shows the global ready count beside New Deck", async () => {
    renderMemora();

    expect(await screen.findByRole("button", { name: "Review 2 Ready" })).toBeInTheDocument();
  });

  it("opens Settings from the deck actions menu", async () => {
    const user = userEvent.setup();
    const getDeckLearningSettings = vi.fn().mockResolvedValue({
      deckId: "english",
      inheritedNewCardsPerDay: 20,
      newCardsPerDay: null,
      effectiveNewCardsPerDay: 20,
    });
    renderMemora({ getDeckLearningSettings });

    await user.click(await screen.findByRole("button", {
      name: "Actions for English",
    }));
    await user.click(screen.getByRole("button", {
      name: "Settings",
    }));

    expect(getDeckLearningSettings).toHaveBeenCalledWith("english");
    expect(await screen.findByRole("dialog", {
      name: "Settings for English",
    })).toBeInTheDocument();
  });
});
