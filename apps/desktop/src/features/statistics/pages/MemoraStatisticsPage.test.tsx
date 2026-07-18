import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { MemoraStatistics } from "../../../domain/statistics";
import { MemoraStatisticsPage } from "./MemoraStatisticsPage";

function makeStats(overrides: Partial<MemoraStatistics> = {}): MemoraStatistics {
  return {
    activeMs: 5400000,
    practiceActiveMs: 3600000,
    sessionCount: 12,
    realReviews: 150,
    recallRate: 0.85,
    ratingDistribution: { again: 10, hard: 20, good: 80, easy: 40 },
    averageAnswerMs: 4500,
    cardStates: { new: 5, learning: 3, review: 100, relearning: 2, suspended: 1 },
    lapseRate: 0.05,
    activeDays: 8,
    dueForecast: { today: 15, next7Days: 80, next30Days: 200 },
    buckets: [],
    ...overrides,
  };
}

test("renders Recall rate and rating distribution labels", async () => {
  const getMemoraStats = vi.fn().mockResolvedValue(makeStats());
  render(
    <MemoraStatisticsPage
      range="30d"
      onRangeChange={vi.fn()}
      getMemoraStats={getMemoraStats}
    />,
  );
  expect(await screen.findByText("Recall rate")).toBeInTheDocument();
  expect(screen.getByText("Again · Hard · Good · Easy")).toBeInTheDocument();
});

test("shows loading skeleton while fetching", () => {
  const getMemoraStats = vi.fn().mockImplementation(() => new Promise(() => {}));
  render(
    <MemoraStatisticsPage
      range="30d"
      onRangeChange={vi.fn()}
      getMemoraStats={getMemoraStats}
    />,
  );
  expect(screen.getByText("Loading...")).toBeInTheDocument();
});

test("shows error state with retry button", async () => {
  const getMemoraStats = vi.fn().mockRejectedValue(new Error("Fail"));
  const user = userEvent.setup();
  render(
    <MemoraStatisticsPage
      range="30d"
      onRangeChange={vi.fn()}
      getMemoraStats={getMemoraStats}
    />,
  );
  expect(await screen.findByText("Something went wrong loading statistics.")).toBeInTheDocument();
  await user.click(screen.getByText("Retry"));
  expect(getMemoraStats).toHaveBeenCalledTimes(2);
});

test("renders recall rate as — when null", async () => {
  const getMemoraStats = vi.fn().mockResolvedValue(makeStats({ recallRate: null }));
  render(
    <MemoraStatisticsPage
      range="30d"
      onRangeChange={vi.fn()}
      getMemoraStats={getMemoraStats}
    />,
  );
  expect(await screen.findByText("—")).toBeInTheDocument();
});

test("renders KPI values", async () => {
  const getMemoraStats = vi.fn().mockResolvedValue(makeStats());
  render(
    <MemoraStatisticsPage
      range="30d"
      onRangeChange={vi.fn()}
      getMemoraStats={getMemoraStats}
    />,
  );
  expect(await screen.findByText("85%")).toBeInTheDocument();
  expect(screen.getByText("12 sessions")).toBeInTheDocument();
  expect(screen.getByText("150 reviews")).toBeInTheDocument();
  expect(screen.getByText("10 · 20 · 80 · 40")).toBeInTheDocument();
});

test("renders due forecast values", async () => {
  const getMemoraStats = vi.fn().mockResolvedValue(makeStats());
  render(
    <MemoraStatisticsPage
      range="30d"
      onRangeChange={vi.fn()}
      getMemoraStats={getMemoraStats}
    />,
  );
  expect(await screen.findByText("15")).toBeInTheDocument();
  expect(screen.getByText("80")).toBeInTheDocument();
  expect(screen.getByText("200")).toBeInTheDocument();
});

test("re-fetches when range changes", async () => {
  const getMemoraStats = vi.fn().mockResolvedValue(makeStats());
  const onRangeChange = vi.fn();
  const { rerender } = render(
    <MemoraStatisticsPage
      range="30d"
      onRangeChange={onRangeChange}
      getMemoraStats={getMemoraStats}
    />,
  );
  await screen.findByText("85%");
  expect(getMemoraStats).toHaveBeenCalledWith("30d");
  rerender(
    <MemoraStatisticsPage
      range="1y"
      onRangeChange={onRangeChange}
      getMemoraStats={getMemoraStats}
    />,
  );
  expect(getMemoraStats).toHaveBeenCalledWith("1y");
});
