import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { DeckStatisticsDetail } from "../../../domain/statistics";
import { DeckStatisticsPage } from "./DeckStatisticsPage";

function makeStats(overrides: Partial<DeckStatisticsDetail> = {}): DeckStatisticsDetail {
  return {
    deckId: "deck-1",
    activeMs: 3600000,
    sessionCount: 6,
    realReviews: 80,
    recallRate: 0.9,
    ratingDistribution: { again: 5, hard: 10, good: 50, easy: 15 },
    averageAnswerMs: 3000,
    cardStates: { new: 10, learning: 2, review: 60, relearning: 1, suspended: 0 },
    lapseRate: 0.03,
    dueForecast: { today: 8, next7Days: 45, next30Days: 120 },
    buckets: [],
    ...overrides,
  };
}

test("renders deck KPIs", async () => {
  const getDeckStats = vi.fn().mockResolvedValue(makeStats());
  render(
    <DeckStatisticsPage
      deckId="deck-1"
      range="30d"
      onRangeChange={vi.fn()}
      getDeckStats={getDeckStats}
    />,
  );
  expect(await screen.findByText("6 sessions")).toBeInTheDocument();
  expect(screen.getByText("80 reviews")).toBeInTheDocument();
  expect(screen.getByText("90%")).toBeInTheDocument();
  expect(screen.getByText("5 · 10 · 50 · 15")).toBeInTheDocument();
});

test("shows loading skeleton while fetching", () => {
  const getDeckStats = vi.fn().mockImplementation(() => new Promise(() => {}));
  render(
    <DeckStatisticsPage
      deckId="deck-1"
      range="30d"
      onRangeChange={vi.fn()}
      getDeckStats={getDeckStats}
    />,
  );
  expect(screen.getByText("Loading...")).toBeInTheDocument();
});

test("shows error state with retry button", async () => {
  const getDeckStats = vi.fn().mockRejectedValue(new Error("Fail"));
  const user = userEvent.setup();
  render(
    <DeckStatisticsPage
      deckId="deck-1"
      range="30d"
      onRangeChange={vi.fn()}
      getDeckStats={getDeckStats}
    />,
  );
  expect(await screen.findByText("Something went wrong loading statistics.")).toBeInTheDocument();
  await user.click(screen.getByText("Retry"));
  expect(getDeckStats).toHaveBeenCalledTimes(2);
});

test("renders — for null recall rate", async () => {
  const getDeckStats = vi.fn().mockResolvedValue(makeStats({ recallRate: null }));
  render(
    <DeckStatisticsPage
      deckId="deck-1"
      range="30d"
      onRangeChange={vi.fn()}
      getDeckStats={getDeckStats}
    />,
  );
  expect(await screen.findByText("—")).toBeInTheDocument();
});

test("renders — for null average answer time", async () => {
  const getDeckStats = vi.fn().mockResolvedValue(makeStats({ averageAnswerMs: null }));
  render(
    <DeckStatisticsPage
      deckId="deck-1"
      range="30d"
      onRangeChange={vi.fn()}
      getDeckStats={getDeckStats}
    />,
  );
  expect(await screen.findByText("—")).toBeInTheDocument();
});

test("renders due forecast values", async () => {
  const getDeckStats = vi.fn().mockResolvedValue(makeStats());
  render(
    <DeckStatisticsPage
      deckId="deck-1"
      range="30d"
      onRangeChange={vi.fn()}
      getDeckStats={getDeckStats}
    />,
  );
  expect(await screen.findByText("8")).toBeInTheDocument();
  expect(screen.getByText("45")).toBeInTheDocument();
  expect(screen.getByText("120")).toBeInTheDocument();
});

test("re-fetches when range changes", async () => {
  const getDeckStats = vi.fn().mockResolvedValue(makeStats());
  const onRangeChange = vi.fn();
  const { rerender } = render(
    <DeckStatisticsPage
      deckId="deck-1"
      range="30d"
      onRangeChange={onRangeChange}
      getDeckStats={getDeckStats}
    />,
  );
  await screen.findByText("6 sessions");
  expect(getDeckStats).toHaveBeenCalledWith("deck-1", "30d");
  rerender(
    <DeckStatisticsPage
      deckId="deck-1"
      range="1y"
      onRangeChange={onRangeChange}
      getDeckStats={getDeckStats}
    />,
  );
  expect(getDeckStats).toHaveBeenCalledWith("deck-1", "1y");
});
