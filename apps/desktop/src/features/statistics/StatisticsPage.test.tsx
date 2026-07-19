import { render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { StatisticsPage } from "./StatisticsPage";
import { activeDayTrend, StatisticsOverviewPage } from "./pages/StatisticsOverviewPage";

const period = { unit: "month" as const, anchorLocalDay: "2026-07-01" };
const overview = { activeMs: 0, readingActiveMs: 0, memoraActiveMs: 0, currentStreak: 0, activeDays: 0, previousActiveMs: 0, previousActiveDays: 0, buckets: [], activeDayBuckets: [], timeBuckets: [] };

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
