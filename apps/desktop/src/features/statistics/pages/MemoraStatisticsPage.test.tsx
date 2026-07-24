import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { MemoraStatistics, StatisticsPeriod } from "../../../domain/statistics";
import { MemoraStatisticsPage } from "./MemoraStatisticsPage";

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
  buckets: [{ localDay: "2026-07-01", activeMs: 1_800_000 }],
  timeBuckets: [
    {
      localDay: "2026-07-01",
      bucketStartHour: 12,
      appKey: "memora",
      activeMs: 1_800_000,
      isFuture: false,
    },
  ],
};

test("renders the Memora summary, rating distribution, card states, due forecast with no app filter or KPI icons", async () => {
  const period: StatisticsPeriod = { unit: "year", anchorLocalDay: "2026-07-01" };
  const getMemoraStats = vi.fn().mockResolvedValue(memoraStats);

  render(<MemoraStatisticsPage period={period} getMemoraStats={getMemoraStats} />);

  expect(await screen.findByRole("list", { name: "Memora summary" }))
    .toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Heatmap" })).toBeInTheDocument();
  expect(screen.getByLabelText(/Rating distribution:/)).toBeInTheDocument();
  expect(screen.getByText("Card states")).toBeInTheDocument();
  expect(screen.getByText("Due forecast")).toBeInTheDocument();
  expect(document.querySelectorAll(".statistics-kpi-card__icon")).toHaveLength(0);
});

test("refetches Memora aggregate statistics when the period changes", async () => {
  const week: StatisticsPeriod = { unit: "week", anchorLocalDay: "2026-07-13" };
  const month: StatisticsPeriod = { unit: "month", anchorLocalDay: "2026-07-01" };
  const getMemoraStats = vi.fn().mockResolvedValue(memoraStats);
  const { rerender } = render(
    <MemoraStatisticsPage period={week} getMemoraStats={getMemoraStats} />,
  );
  await waitFor(() => expect(getMemoraStats).toHaveBeenCalledWith(week));

  rerender(
    <MemoraStatisticsPage period={month} getMemoraStats={getMemoraStats} />,
  );
  await waitFor(() =>
    expect(getMemoraStats).toHaveBeenLastCalledWith(month),
  );
  expect(getMemoraStats).toHaveBeenCalledTimes(2);
});

test("retries only the active Memora statistics request", async () => {
  const user = userEvent.setup();
  const period: StatisticsPeriod = { unit: "week", anchorLocalDay: "2026-07-13" };
  const getMemoraStats = vi.fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(memoraStats);
  render(
    <MemoraStatisticsPage period={period} getMemoraStats={getMemoraStats} />,
  );

  await user.click(await screen.findByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("list", { name: "Memora summary" }))
    .toBeInTheDocument();
  expect(getMemoraStats).toHaveBeenCalledTimes(2);
});
