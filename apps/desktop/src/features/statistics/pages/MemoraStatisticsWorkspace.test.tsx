import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { Deck } from "../../../domain/learning";
import type {
  DeckStatisticsDetail,
  MemoraStatistics,
  StatisticsPeriod,
} from "../../../domain/statistics";
import { MemoraStatisticsWorkspace } from "./MemoraStatisticsWorkspace";

const period: StatisticsPeriod = {
  unit: "month",
  anchorLocalDay: "2026-07-01",
};

const deckA: Deck = {
  id: "deck-a",
  name: "Deck A",
  description: "First deck",
  color: "#4caf50",
  archived: false,
};

const deckB: Deck = {
  id: "deck-b",
  name: "Deck B",
  description: null,
  color: null,
  archived: false,
};

const memoraStats: MemoraStatistics = {
  activeMs: 1_800_000,
  practiceActiveMs: 900_000,
  sessionCount: 10,
  realReviews: 200,
  recallRate: 0.85,
  ratingDistribution: { again: 5, hard: 10, good: 20, easy: 15 },
  averageAnswerMs: 5_000,
  cardStates: { new: 30, learning: 10, review: 50, relearning: 5, suspended: 2 },
  lapseRate: 0.12,
  activeDays: 15,
  dueForecast: { today: 12, next7Days: 40, next30Days: 100 },
  buckets: [],
  timeBuckets: [],
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
  timeBuckets: [],
};

const getMemoraStats = vi.fn().mockResolvedValue(memoraStats);
const getDeckStats = vi.fn().mockResolvedValue(deckStats);

test("loads decks once and switches detail scope without losing the list", async () => {
  const user = userEvent.setup();
  const listDecks = vi.fn().mockResolvedValue([deckA, deckB]);
  const onSelectDeck = vi.fn();
  render(
    <MemoraStatisticsWorkspace
      listDecks={listDecks}
      selectedDeckId={null}
      onSelectDeck={onSelectDeck}
      period={period}
      getMemoraStats={getMemoraStats}
      getDeckStats={getDeckStats}
    />,
  );

  expect(await screen.findByRole("button", { name: /Deck A/ }))
    .toBeInTheDocument();
  expect(listDecks).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: /Deck A/ }));
  expect(onSelectDeck).toHaveBeenCalledWith("deck-a");
  expect(
    screen.getByRole("navigation", { name: "Memora statistics scopes" }),
  ).toBeInTheDocument();
});

test("keeps aggregate statistics usable when the deck list fails", async () => {
  const user = userEvent.setup();
  const listDecks = vi.fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce([deckA]);
  render(
    <MemoraStatisticsWorkspace
      listDecks={listDecks}
      selectedDeckId={null}
      onSelectDeck={vi.fn()}
      period={period}
      getMemoraStats={getMemoraStats}
      getDeckStats={getDeckStats}
    />,
  );

  expect(await screen.findByRole("button", { name: "Retry scopes" }))
    .toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "All Memora" }))
    .toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Retry scopes" }));
  expect(await screen.findByRole("button", { name: /Deck A/ }))
    .toBeInTheDocument();
  expect(listDecks).toHaveBeenCalledTimes(2);
});

test("loads a deep-linked deck by ID while its list metadata is pending", () => {
  const listDecks = vi.fn(
    () => new Promise<Deck[]>(() => undefined),
  );
  render(
    <MemoraStatisticsWorkspace
      listDecks={listDecks}
      selectedDeckId="deck-a"
      onSelectDeck={vi.fn()}
      period={period}
      getMemoraStats={getMemoraStats}
      getDeckStats={getDeckStats}
    />,
  );
  expect(screen.getByRole("heading", { name: "Deck statistics" }))
    .toBeInTheDocument();
  expect(getDeckStats).toHaveBeenCalledWith("deck-a", period);
});

test("shows an unavailable state after a deep-linked deck is absent from the resolved list", async () => {
  const missingDeckStats = vi.fn().mockResolvedValue({
    ...deckStats,
    deckId: "missing",
  });

  render(
    <MemoraStatisticsWorkspace
      listDecks={vi.fn().mockResolvedValue([deckA])}
      selectedDeckId="missing"
      onSelectDeck={vi.fn()}
      period={period}
      getMemoraStats={getMemoraStats}
      getDeckStats={missingDeckStats}
    />,
  );

  expect(await screen.findByRole("status"))
    .toHaveTextContent("This deck is no longer available");
  expect(screen.getByRole("button", { name: "All Memora" }))
    .toBeInTheDocument();
  expect(missingDeckStats).toHaveBeenCalledWith("missing", period);
});
