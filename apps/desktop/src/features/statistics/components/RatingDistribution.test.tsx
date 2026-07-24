import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { RatingDistribution } from "./RatingDistribution";

test("renders truthful zero and non-zero rating distributions", () => {
  const { rerender } = render(
    <RatingDistribution
      distribution={{ again: 0, hard: 0, good: 0, easy: 0 }}
    />,
  );
  expect(screen.getByLabelText("Rating distribution: no reviews")).toBeInTheDocument();
  expect(screen.getAllByText("0")).toHaveLength(4);

  rerender(
    <RatingDistribution
      distribution={{ again: 1, hard: 2, good: 6, easy: 1 }}
    />,
  );
  expect(screen.getByLabelText(
    "Rating distribution: Again 1, Hard 2, Good 6, Easy 1",
  )).toBeInTheDocument();
  expect(screen.getByTestId("rating-good-segment")).toHaveStyle({ flexGrow: "6" });
});
