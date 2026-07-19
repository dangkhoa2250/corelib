import { render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { StatisticsPage } from "./StatisticsPage";
import { StatisticsOverviewPage } from "./pages/StatisticsOverviewPage";

const period = { unit: "month" as const, anchorLocalDay: "2026-07-01" };
const overview = { activeMs: 0, readingActiveMs: 0, memoraActiveMs: 0, currentStreak: 0, activeDays: 0, previousActiveMs: 0, previousActiveDays: 0, buckets: [], timeBuckets: [] };

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

test("reloads overview with the newly selected calendar period", async () => {
  const getOverview = vi.fn().mockResolvedValue(overview);
  const nextPeriod = { unit: "week" as const, anchorLocalDay: "2026-07-13" };
  const { rerender } = render(<StatisticsOverviewPage period={period} onPeriodChange={vi.fn()} getOverview={getOverview} />);
  await waitFor(() => expect(getOverview).toHaveBeenCalledWith(period));
  rerender(<StatisticsOverviewPage period={nextPeriod} onPeriodChange={vi.fn()} getOverview={getOverview} />);
  await waitFor(() => expect(getOverview).toHaveBeenLastCalledWith(nextPeriod));
});
