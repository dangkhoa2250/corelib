import { render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { DeckStatisticsPage } from "./DeckStatisticsPage";

const deckStats = {
  deckId: "deck-123",
  activeMs: 0,
  sessionCount: 0,
  realReviews: 0,
  recallRate: null,
  ratingDistribution: { again: 0, hard: 0, good: 0, easy: 0 },
  averageAnswerMs: null,
  cardStates: { new: 0, learning: 0, review: 0, relearning: 0, suspended: 0 },
  lapseRate: null,
  dueForecast: { today: 0, next7Days: 0, next30Days: 0 },
  buckets: [],
  timeBuckets: [],
};

test("loads deck data with its deck ID and supplied calendar period", async () => {
  const period = { unit: "week" as const, anchorLocalDay: "2026-07-13" };
  const getDeckStats = vi.fn().mockResolvedValue(deckStats);

  render(
    <DeckStatisticsPage
      deckId="deck-123"
      period={period}
      getDeckStats={getDeckStats}
    />,
  );

  expect(await screen.findByText("Ratings")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Heatmap" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Graph" })).toHaveAttribute("aria-pressed", "true");
  await waitFor(() =>
    expect(getDeckStats).toHaveBeenCalledWith("deck-123", period),
  );
});
