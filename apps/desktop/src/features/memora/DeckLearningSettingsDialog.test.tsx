import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { test, expect, vi } from "vitest";
import { DeckLearningSettingsDialog } from "./DeckLearningSettingsDialog";

test("shows inherited value and saves a custom deck limit", async () => {
  const user = userEvent.setup();
  const save = vi.fn().mockResolvedValue({
    deckId: "deck-1",
    inheritedNewCardsPerDay: 20,
    newCardsPerDay: 7,
    effectiveNewCardsPerDay: 7,
  });
  render(
    <DeckLearningSettingsDialog
      deckName="Biology"
      settings={{
        deckId: "deck-1",
        inheritedNewCardsPerDay: 20,
        newCardsPerDay: null,
        effectiveNewCardsPerDay: 20,
      }}
      onCancel={vi.fn()}
      onSave={save}
    />,
  );

  expect(screen.getByText("Use Memora default (20/day)")).toBeInTheDocument();
  await user.click(screen.getByLabelText("Custom limit"));
  await user.clear(screen.getByLabelText("Custom new cards per day"));
  await user.type(screen.getByLabelText("Custom new cards per day"), "7");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(save).toHaveBeenCalledWith(7);
});

test("saving inheritance removes the custom override", async () => {
  const user = userEvent.setup();
  const save = vi.fn().mockResolvedValue({});
  render(
    <DeckLearningSettingsDialog
      deckName="Biology"
      settings={{
        deckId: "deck-1",
        inheritedNewCardsPerDay: 20,
        newCardsPerDay: 7,
        effectiveNewCardsPerDay: 7,
      }}
      onCancel={vi.fn()}
      onSave={save}
    />,
  );
  await user.click(screen.getByLabelText("Use Memora default"));
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(save).toHaveBeenCalledWith(null);
});
