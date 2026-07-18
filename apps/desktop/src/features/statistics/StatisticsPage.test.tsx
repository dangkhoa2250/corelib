import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { StatisticsPage } from "./StatisticsPage";
import { StatisticsOverviewPage } from "./pages/StatisticsOverviewPage";
import type { StatisticsOverview } from "../../domain/statistics";

test("renders overview page by default", async () => {
  render(<StatisticsPage />);
  expect(await screen.findByText("30 days")).toBeInTheDocument();
});

test("renders overview page when target is overview", async () => {
  render(<StatisticsPage />);
  expect(await screen.findByText("30 days")).toBeInTheDocument();
});

test("renders KPI cards with formatted values", async () => {
  const mockOverview: StatisticsOverview = {
    activeMs: 73800000,
    readingActiveMs: 36000000,
    memoraActiveMs: 37800000,
    currentStreak: 5,
    activeDays: 12,
    buckets: [],
  };
  const getOverview = vi.fn().mockResolvedValue(mockOverview);

  render(
    <StatisticsOverviewPage
      range="30d"
      onRangeChange={vi.fn()}
      getOverview={getOverview}
    />,
  );

  expect(await screen.findByText("20h 30m")).toBeInTheDocument();
  expect(screen.getByText("5 days")).toBeInTheDocument();
  expect(screen.getByText("12")).toBeInTheDocument();
});

test("shows loading state initially", () => {
  const getOverview = vi.fn().mockReturnValue(new Promise(() => {}));

  render(
    <StatisticsOverviewPage
      range="30d"
      onRangeChange={vi.fn()}
      getOverview={getOverview}
    />,
  );

  expect(screen.getByText("Loading...")).toBeInTheDocument();
});

test("shows error state on failure", async () => {
  const getOverview = vi.fn().mockRejectedValue(new Error("DB error"));

  render(
    <StatisticsOverviewPage
      range="30d"
      onRangeChange={vi.fn()}
      getOverview={getOverview}
    />,
  );

  expect(await screen.findByText("DB error")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
});

test("shows empty state when no data returned", async () => {
  const getOverview = vi.fn().mockResolvedValue(null);

  render(
    <StatisticsOverviewPage
      range="30d"
      onRangeChange={vi.fn()}
      getOverview={getOverview}
    />,
  );

  expect(await screen.findByText(/No data/i)).toBeInTheDocument();
});

test("routes to ReadingStatisticsPage when target is app reading", async () => {
  render(<StatisticsPage target={{ kind: "app", appKey: "reading" }} />);
  expect(await screen.findByText("Reading")).toBeInTheDocument();
});

test("routes to MemoraStatisticsPage when target is app memora", async () => {
  render(<StatisticsPage target={{ kind: "app", appKey: "memora" }} />);
  expect(await screen.findByText("Memora")).toBeInTheDocument();
});

test("routes to DocumentStatisticsPage when target is document", async () => {
  render(<StatisticsPage target={{ kind: "document", documentId: "doc-1" }} />);
  expect(await screen.findByText("Document")).toBeInTheDocument();
});

test("routes to DeckStatisticsPage when target is deck", async () => {
  render(<StatisticsPage target={{ kind: "deck", deckId: "deck-1" }} />);
  expect(await screen.findByText("Deck")).toBeInTheDocument();
});
