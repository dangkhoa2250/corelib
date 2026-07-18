import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { ReadingStatistics } from "../../../domain/statistics";
import { ReadingStatisticsPage } from "./ReadingStatisticsPage";

function makeStats(overrides: Partial<ReadingStatistics> = {}): ReadingStatistics {
  return {
    activeMs: 7200000,
    sessionCount: 5,
    averageSessionMs: 1200000,
    pageVisits: 42,
    uniquePages: 3,
    revisits: 7,
    buckets: [],
    ...overrides,
  };
}

test("renders KPI values from reading statistics", async () => {
  const getReadingStats = vi.fn().mockResolvedValue(makeStats());
  render(
    <ReadingStatisticsPage
      range="30d"
      onRangeChange={vi.fn()}
      getReadingStats={getReadingStats}
    />,
  );
  expect(await screen.findByText("5 sessions")).toBeInTheDocument();
  expect(screen.getByText("42 visits")).toBeInTheDocument();
  expect(screen.getByText("3")).toBeInTheDocument();
});

test("shows loading skeleton while fetching", () => {
  const getReadingStats = vi.fn().mockImplementation(() => new Promise(() => {}));
  render(
    <ReadingStatisticsPage
      range="30d"
      onRangeChange={vi.fn()}
      getReadingStats={getReadingStats}
    />,
  );
  expect(screen.getByText("Loading...")).toBeInTheDocument();
});

test("shows error state with retry button", async () => {
  const getReadingStats = vi.fn().mockRejectedValue(new Error("Network error"));
  const user = userEvent.setup();
  render(
    <ReadingStatisticsPage
      range="30d"
      onRangeChange={vi.fn()}
      getReadingStats={getReadingStats}
    />,
  );
  expect(await screen.findByText("Something went wrong loading statistics.")).toBeInTheDocument();
  await user.click(screen.getByText("Retry"));
  expect(getReadingStats).toHaveBeenCalledTimes(2);
});

test("renders — for null average session time", async () => {
  const getReadingStats = vi.fn().mockResolvedValue(makeStats({ averageSessionMs: null }));
  render(
    <ReadingStatisticsPage
      range="30d"
      onRangeChange={vi.fn()}
      getReadingStats={getReadingStats}
    />,
  );
  expect(await screen.findByText("—")).toBeInTheDocument();
});

test("formats active time correctly", async () => {
  const getReadingStats = vi.fn().mockResolvedValue(makeStats({ activeMs: 3660000 }));
  render(
    <ReadingStatisticsPage
      range="30d"
      onRangeChange={vi.fn()}
      getReadingStats={getReadingStats}
    />,
  );
  expect(await screen.findByText("1h 1m")).toBeInTheDocument();
});

test("re-fetches when range changes", async () => {
  const getReadingStats = vi.fn().mockResolvedValue(makeStats());
  const onRangeChange = vi.fn();
  const { rerender } = render(
    <ReadingStatisticsPage
      range="30d"
      onRangeChange={onRangeChange}
      getReadingStats={getReadingStats}
    />,
  );
  await screen.findByText("5 sessions");
  expect(getReadingStats).toHaveBeenCalledWith("30d");
  rerender(
    <ReadingStatisticsPage
      range="7d"
      onRangeChange={onRangeChange}
      getReadingStats={getReadingStats}
    />,
  );
  expect(getReadingStats).toHaveBeenCalledWith("7d");
});

test("shows unique pages and revisits", async () => {
  const getReadingStats = vi.fn().mockResolvedValue(makeStats({ uniquePages: 8, revisits: 14 }));
  render(
    <ReadingStatisticsPage
      range="30d"
      onRangeChange={vi.fn()}
      getReadingStats={getReadingStats}
    />,
  );
  expect(await screen.findByText("8")).toBeInTheDocument();
  expect(screen.getByText("14")).toBeInTheDocument();
});
