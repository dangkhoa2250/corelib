import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { ReviewFlashcard } from "./ReviewFlashcard";

function Harness({ onReveal = () => undefined }: { onReveal?: () => void }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <ReviewFlashcard
      revealed={revealed}
      onReveal={() => {
        onReveal();
        setRevealed(true);
      }}
      front={<span>Front content</span>}
      backFront={<span>Back-side front content</span>}
      back={<span>Back content</span>}
    />
  );
}

test("keeps both faces mounted throughout the flip", async () => {
  const user = userEvent.setup();
  const onReveal = vi.fn();
  render(<Harness onReveal={onReveal} />);

  const flashcard = screen.getByRole("button", { name: "Flashcard" });
  expect(flashcard.querySelectorAll(".review-page__card-face--front")).toHaveLength(1);
  expect(flashcard.querySelectorAll(".review-page__card-face--back")).toHaveLength(1);
  expect(flashcard).not.toHaveClass("review-page__card--flipped");

  await user.click(flashcard);

  expect(flashcard).toHaveClass("review-page__card--flipped");
  expect(flashcard.querySelectorAll(".review-page__card-face--front")).toHaveLength(1);
  expect(flashcard.querySelectorAll(".review-page__card-face--back")).toHaveLength(1);
  expect(onReveal).toHaveBeenCalledOnce();

  await user.click(flashcard);
  expect(onReveal).toHaveBeenCalledOnce();
});

test.each([
  ["Enter", "{Enter}"],
  ["Space", " "],
])("reveals with the %s key", async (_label, key) => {
  const user = userEvent.setup();
  render(<Harness />);
  const flashcard = screen.getByRole("button", { name: "Flashcard" });
  flashcard.focus();

  await user.keyboard(key);

  expect(flashcard).toHaveClass("review-page__card--flipped");
});
