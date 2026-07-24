import {
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type {
  DeckStatisticsDetail,
  StatisticsPeriod,
} from "../../../domain/statistics";
import type { Deck } from "../../../domain/learning";
import { DeckStatisticsPage } from "./DeckStatisticsPage";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const period: StatisticsPeriod = {
  unit: "week",
  anchorLocalDay: "2026-07-13",
};

const deckA: Deck = {
  id: "deck-a",
  name: "Biology",
  description: "Cell biology and genetics",
  color: "#4caf50",
  archived: false,
};

const deckB: Deck = {
  id: "deck-b",
  name: "Chemistry",
  description: null,
  color: null,
  archived: false,
};

const deckStats: DeckStatisticsDetail = {
  deckId: "deck-a",
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
  timeBuckets: [
    {
      localDay: "2026-07-01",
      bucketStartHour: 8,
      appKey: "memora",
      activeMs: 1_800_000,
      isFuture: false,
    },
  ],
};

test("renders the deck detail with heatmap, rating distribution, and no aggregate-only metrics", async () => {
  const getDeckStats = vi.fn().mockResolvedValue(deckStats);
  render(
    <DeckStatisticsPage
      deckId="deck-a"
      deck={deckA}
      period={period}
      getDeckStats={getDeckStats}
    />,
  );

  expect(await screen.findByRole("heading", { name: "Biology" }))
    .toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Heatmap" })).toBeInTheDocument();
  expect(screen.getByLabelText(/Rating distribution:/)).toBeInTheDocument();
  expect(screen.queryByText("Active days")).toBeNull();
  expect(screen.queryByText("Practice active time")).toBeNull();
});

test("ignores a deck response after the selected deck changes", async () => {
  const first = deferred<DeckStatisticsDetail>();
  const second = deferred<DeckStatisticsDetail>();
  const getDeckStats = vi.fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const { rerender } = render(
    <DeckStatisticsPage
      deckId="deck-a"
      deck={deckA}
      period={period}
      getDeckStats={getDeckStats}
    />,
  );
  rerender(
    <DeckStatisticsPage
      deckId="deck-b"
      deck={deckB}
      period={period}
      getDeckStats={getDeckStats}
    />,
  );
  second.resolve({
    ...deckStats,
    deckId: "deck-b",
    activeMs: 120_000,
  });
  const summary = await screen.findByRole("list", { name: "Memora summary" });
  expect(within(summary).getByText("2m")).toBeInTheDocument();

  first.resolve({
    ...deckStats,
    deckId: "deck-a",
    activeMs: 60_000,
  });
  await waitFor(() => {
    expect(within(summary).queryByText("1m")).toBeNull();
    expect(within(summary).getByText("2m")).toBeInTheDocument();
  });
});

test("refetches the selected deck when the period changes", async () => {
  const week: StatisticsPeriod = { unit: "week", anchorLocalDay: "2026-07-13" };
  const month: StatisticsPeriod = { unit: "month", anchorLocalDay: "2026-07-01" };
  const getDeckStats = vi.fn().mockResolvedValue(deckStats);
  const { rerender } = render(
    <DeckStatisticsPage
      deckId="deck-a"
      deck={deckA}
      period={week}
      getDeckStats={getDeckStats}
    />,
  );
  await waitFor(() =>
    expect(getDeckStats).toHaveBeenCalledWith("deck-a", week),
  );

  rerender(
    <DeckStatisticsPage
      deckId="deck-a"
      deck={deckA}
      period={month}
      getDeckStats={getDeckStats}
    />,
  );
  await waitFor(() =>
    expect(getDeckStats).toHaveBeenLastCalledWith("deck-a", month),
  );
  expect(getDeckStats).toHaveBeenCalledTimes(2);
});
