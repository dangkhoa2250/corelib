import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoraPage } from "./MemoraPage";

const englishDeck = {
  id: "english",
  name: "English",
  description: "General vocabulary",
  color: null,
  archived: false,
};

function renderMemora() {
  const onOpenDeck = vi.fn();
  const onStudyDeck = vi.fn();
  const onPracticeAll = vi.fn();

  render(
    <MemoraPage
      countDeckCards={vi.fn().mockResolvedValue(4)}
      createDeck={vi.fn()}
      deleteDeck={vi.fn()}
      getDeckStatistics={vi.fn().mockResolvedValue({
        totalCards: 4,
        newCards: 1,
        learningCards: 1,
        reviewCards: 1,
        dueCards: 0,
      })}
      listDecks={vi.fn().mockResolvedValue([englishDeck])}
      listDueCards={vi.fn().mockResolvedValue([{ id: "due-1" }, { id: "due-2" }])}
      onOpenDeck={onOpenDeck}
      onPracticeAll={onPracticeAll}
      onReviewToday={vi.fn()}
      onStudyDeck={onStudyDeck}
      renameDeck={vi.fn()}
    />,
  );

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
});
