import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import type { LibraryDocument } from "../../domain/document";
import type { Deck } from "../../domain/learning";
import type { ReadingStatistics, DocumentStatistics, MemoraStatistics, DeckStatisticsDetail } from "../../domain/statistics";
import { StatisticsPage } from "./StatisticsPage";
import { activeDayTrend, StatisticsOverviewPage } from "./pages/StatisticsOverviewPage";

vi.mocked(invoke).mockImplementation(async (cmd: string) => {
  if (cmd === "get_reading_statistics") {
    return { activeMs: 0, sessionCount: 0, averageSessionMs: null, pageVisits: 0, uniquePages: 0, revisits: 0, buckets: [], timeBuckets: [] } satisfies ReadingStatistics;
  }
  if (cmd === "get_document_statistics") {
    return { documentId: "doc-a", activeMs: 0, sessionCount: 0, averageSessionMs: null, pageVisits: 0, uniquePages: 0, revisits: 0, coverage: 0, realReviews: 0, recallRate: null, againCount: 0, lapses: 0, buckets: [], timeBuckets: [] } satisfies DocumentStatistics;
  }
  if (cmd === "get_memora_statistics") {
    return { activeMs: 0, practiceActiveMs: 0, sessionCount: 0, realReviews: 0, recallRate: null, ratingDistribution: { again: 0, hard: 0, good: 0, easy: 0 }, averageAnswerMs: null, cardStates: { new: 0, learning: 0, review: 0, relearning: 0, suspended: 0 }, lapseRate: null, activeDays: 0, dueForecast: { today: 0, next7Days: 0, next30Days: 0 }, buckets: [], timeBuckets: [] } satisfies MemoraStatistics;
  }
  if (cmd === "get_deck_statistics_detail") {
    return { deckId: "deck-a", activeMs: 0, sessionCount: 0, realReviews: 0, recallRate: null, ratingDistribution: { again: 0, hard: 0, good: 0, easy: 0 }, averageAnswerMs: null, cardStates: { new: 0, learning: 0, review: 0, relearning: 0, suspended: 0 }, lapseRate: null, dueForecast: { today: 0, next7Days: 0, next30Days: 0 }, buckets: [], timeBuckets: [] } satisfies DeckStatisticsDetail;
  }
  return undefined as any;
});

const period = { unit: "month" as const, anchorLocalDay: "2026-07-01" };
const overview = { activeMs: 0, readingActiveMs: 0, memoraActiveMs: 0, currentStreak: 0, activeDays: 0, previousActiveMs: 0, previousActiveDays: 0, buckets: [], activeDayBuckets: [], timeBuckets: [] };

const documentA: LibraryDocument = {
  id: "doc-a",
  title: "Document A",
  author: "Jane Doe",
  source: "local_managed",
  coverUrl: null,
  indexed: true,
  status: "ready",
  lastReadPage: 50,
  numPages: 100,
};

const deckA: Deck = {
  id: "deck-a",
  name: "Deck A",
  description: "First deck",
  color: "#4caf50",
  archived: false,
};

test("uses backend active-day eligibility rather than daily active time", () => {
  expect(activeDayTrend([
    { localDay: "2026-07-16", isActiveDay: true },
    { localDay: "2026-07-17", isActiveDay: false },
    { localDay: "2026-07-18", isActiveDay: true },
  ])).toEqual([1, 0, 1]);
});

test("defaults personal statistics to the current calendar month", async () => {
  render(<StatisticsPage />);
  expect(await screen.findByRole("button", { name: "Month" })).toHaveAttribute("aria-pressed", "true");
});

test("passes a calendar period to overview loading", async () => {
  const getOverview = vi.fn().mockResolvedValue(overview);
  render(<StatisticsOverviewPage period={period} onPeriodChange={vi.fn()} getOverview={getOverview} />);
  expect(await screen.findByText("0m")).toBeInTheDocument();
  expect(getOverview).toHaveBeenCalledWith(period);
});

test("wires local time buckets from overview data into the activity heatmap", async () => {
  const getOverview = vi.fn().mockResolvedValue({
    ...overview,
    activeMs: 15 * 60_000,
    activeDays: 1,
    timeBuckets: [{
      localDay: "2026-07-13",
      bucketStartHour: 12,
      activeMs: 15 * 60_000,
      appKey: "reading",
      isFuture: false,
    }],
  });
  render(<StatisticsOverviewPage period={{ unit: "week", anchorLocalDay: "2026-07-13" }} onPeriodChange={vi.fn()} getOverview={getOverview} />);

  expect(await screen.findByRole("gridcell", { name: /July 13, 2026, 12:00–16:00: 15 minutes/ })).toBeInTheDocument();
});

test("renders backend previous-period comparisons without comparing the lifetime streak", async () => {
  const getOverview = vi.fn().mockResolvedValue({
    ...overview,
    activeMs: 120_000,
    previousActiveMs: 60_000,
    activeDays: 2,
    previousActiveDays: 1,
    currentStreak: 7,
    buckets: [
      { localDay: "2026-07-01", activeMs: 30_000 },
      { localDay: "2026-07-02", activeMs: 90_000 },
    ],
    activeDayBuckets: [
      { localDay: "2026-07-01", isActiveDay: false },
      { localDay: "2026-07-02", isActiveDay: true },
      { localDay: "2026-07-03", isActiveDay: true },
    ],
  });
  render(<StatisticsOverviewPage period={period} onPeriodChange={vi.fn()} getOverview={getOverview} />);

  expect(await screen.findAllByText("↑ 100% vs previous month")).toHaveLength(2);
  expect(screen.getByRole("img", { name: "Active days trend" })).toBeInTheDocument();
  expect(screen.getByText("Current streak").closest(".statistics-card")?.querySelector("[data-kind]")).toBeNull();
});

test("reloads overview with the newly selected calendar period", async () => {
  const getOverview = vi.fn().mockResolvedValue(overview);
  const nextPeriod = { unit: "week" as const, anchorLocalDay: "2026-07-13" };
  const { rerender } = render(<StatisticsOverviewPage period={period} onPeriodChange={vi.fn()} getOverview={getOverview} />);
  await waitFor(() => expect(getOverview).toHaveBeenCalledWith(period));
  rerender(<StatisticsOverviewPage period={nextPeriod} onPeriodChange={vi.fn()} getOverview={getOverview} />);
  await waitFor(() => expect(getOverview).toHaveBeenLastCalledWith(nextPeriod));
});

test("keeps every registered app available in the activity filter when its summary fails", async () => {
  const user = userEvent.setup();
  const getOverview = vi.fn().mockResolvedValue(overview);
  const failedApp = {
    key: "reading",
    title: "Reading",
    tagline: "Stay curious. Keep reading.",
    icon: () => null,
    loadSummary: vi.fn().mockRejectedValue(new Error("unavailable")),
    loadDetail: vi.fn(),
  };
  render(
    <StatisticsOverviewPage
      period={period}
      onPeriodChange={vi.fn()}
      getOverview={getOverview}
      apps={[failedApp]}
    />,
  );

  const filter = await screen.findByRole("combobox", { name: "Statistics app" });
  await waitFor(() => expect(failedApp.loadSummary).toHaveBeenCalledWith(period));
  await screen.findByText("Statistics unavailable");
  await user.click(filter);
  expect(screen.getByRole("option", { name: "Reading" })).toBeInTheDocument();
});

test("maps document and deck targets into their persistent app workspaces", async () => {
  const { rerender } = render(
    <StatisticsPage
      documents={[documentA]}
      documentsLoading={false}
      listDecks={vi.fn().mockResolvedValue([deckA])}
      target={{ kind: "document", documentId: "doc-a" }}
    />,
  );
  expect(await screen.findByRole("navigation", {
    name: "Reading statistics scopes",
  })).toBeInTheDocument();

  rerender(
    <StatisticsPage
      documents={[documentA]}
      documentsLoading={false}
      listDecks={vi.fn().mockResolvedValue([deckA])}
      target={{ kind: "deck", deckId: "deck-a" }}
    />,
  );
  expect(await screen.findByRole("navigation", {
    name: "Memora statistics scopes",
  })).toBeInTheDocument();
});

test("returns to the recorded origin instead of swallowing Back in item scope", async () => {
  const user = userEvent.setup();
  const onBack = vi.fn();
  render(
    <StatisticsPage
      origin="library"
      onBack={onBack}
      documents={[documentA]}
      documentsLoading={false}
      listDecks={vi.fn().mockResolvedValue([])}
      target={{ kind: "document", documentId: "doc-a" }}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(onBack).toHaveBeenCalledOnce();
});

test("returns built-in app pages to Statistics overview when no origin exists", async () => {
  const user = userEvent.setup();
  render(
    <StatisticsPage
      documents={[]}
      documentsLoading={false}
      listDecks={vi.fn().mockResolvedValue([])}
      target={{ kind: "app", appKey: "reading" }}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(await screen.findByRole("heading", { name: "Statistics" }))
    .toBeInTheDocument();
});

test("keeps non-built-in registered apps on the generic detail page", async () => {
  const custom = {
    key: "custom",
    title: "Custom",
    tagline: "Custom stats",
    icon: () => null,
    loadSummary: vi.fn(),
    loadDetail: vi.fn().mockResolvedValue({
      appKey: "custom",
      metrics: [],
      buckets: [],
    }),
  };
  render(<StatisticsPage target={{ kind: "app", appKey: "custom" }} apps={[custom]} />);
  await waitFor(() => expect(custom.loadDetail).toHaveBeenCalled());
});
