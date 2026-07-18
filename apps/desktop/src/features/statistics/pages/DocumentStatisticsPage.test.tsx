import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { DocumentStatistics } from "../../../domain/statistics";
import { DocumentStatisticsPage } from "./DocumentStatisticsPage";

function makeStats(overrides: Partial<DocumentStatistics> = {}): DocumentStatistics {
  return {
    documentId: "doc-1",
    activeMs: 3600000,
    sessionCount: 3,
    averageSessionMs: 1200000,
    pageVisits: 20,
    uniquePages: 5,
    revisits: 8,
    coverage: 0.3,
    realReviews: 25,
    recallRate: 0.75,
    againCount: 4,
    lapses: 2,
    buckets: [],
    ...overrides,
  };
}

test("renders coverage with lifetime label", async () => {
  const getDocStats = vi.fn().mockResolvedValue(makeStats());
  render(
    <DocumentStatisticsPage
      documentId="doc-1"
      range="30d"
      onRangeChange={vi.fn()}
      getDocStats={getDocStats}
    />,
  );
  expect(await screen.findByText("30% coverage")).toBeInTheDocument();
  expect(screen.getByText("Lifetime navigation coverage")).toBeInTheDocument();
});

test("does not render completed label", async () => {
  const getDocStats = vi.fn().mockResolvedValue(makeStats());
  render(
    <DocumentStatisticsPage
      documentId="doc-1"
      range="30d"
      onRangeChange={vi.fn()}
      getDocStats={getDocStats}
    />,
  );
  expect(await screen.findByText("30% coverage")).toBeInTheDocument();
  expect(screen.queryByText(/completed/i)).not.toBeInTheDocument();
});

test("shows loading skeleton while fetching", () => {
  const getDocStats = vi.fn().mockImplementation(() => new Promise(() => {}));
  render(
    <DocumentStatisticsPage
      documentId="doc-1"
      range="30d"
      onRangeChange={vi.fn()}
      getDocStats={getDocStats}
    />,
  );
  expect(screen.getByText("Loading...")).toBeInTheDocument();
});

test("shows error state with retry button", async () => {
  const getDocStats = vi.fn().mockRejectedValue(new Error("Oops"));
  const user = userEvent.setup();
  render(
    <DocumentStatisticsPage
      documentId="doc-1"
      range="30d"
      onRangeChange={vi.fn()}
      getDocStats={getDocStats}
    />,
  );
  expect(await screen.findByText("Something went wrong loading statistics.")).toBeInTheDocument();
  await user.click(screen.getByText("Retry"));
  expect(getDocStats).toHaveBeenCalledTimes(2);
});

test("renders KPI values", async () => {
  const getDocStats = vi.fn().mockResolvedValue(makeStats());
  render(
    <DocumentStatisticsPage
      documentId="doc-1"
      range="30d"
      onRangeChange={vi.fn()}
      getDocStats={getDocStats}
    />,
  );
  expect(await screen.findByText("3 sessions")).toBeInTheDocument();
  expect(screen.getByText("20 visits")).toBeInTheDocument();
  expect(screen.getByText("25 reviews")).toBeInTheDocument();
  expect(screen.getByText("75%")).toBeInTheDocument();
  expect(screen.getByText("4")).toBeInTheDocument();
  expect(screen.getByText("2")).toBeInTheDocument();
});

test("renders — for null recall rate", async () => {
  const getDocStats = vi.fn().mockResolvedValue(makeStats({ recallRate: null }));
  render(
    <DocumentStatisticsPage
      documentId="doc-1"
      range="30d"
      onRangeChange={vi.fn()}
      getDocStats={getDocStats}
    />,
  );
  expect(await screen.findByText("—")).toBeInTheDocument();
});

test("re-fetches when range changes", async () => {
  const getDocStats = vi.fn().mockResolvedValue(makeStats());
  const onRangeChange = vi.fn();
  const { rerender } = render(
    <DocumentStatisticsPage
      documentId="doc-1"
      range="30d"
      onRangeChange={onRangeChange}
      getDocStats={getDocStats}
    />,
  );
  await screen.findByText("30% coverage");
  expect(getDocStats).toHaveBeenCalledWith("doc-1", "30d");
  rerender(
    <DocumentStatisticsPage
      documentId="doc-1"
      range="7d"
      onRangeChange={onRangeChange}
      getDocStats={getDocStats}
    />,
  );
  expect(getDocStats).toHaveBeenCalledWith("doc-1", "7d");
});
