import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { ReadingStatistics } from "../../../domain/statistics";
import { ReadingStatisticsPage } from "./ReadingStatisticsPage";

const readingStats: ReadingStatistics = {
  activeMs: 3_600_000,
  sessionCount: 5,
  averageSessionMs: 720_000,
  pageVisits: 42,
  uniquePages: 20,
  revisits: 22,
  buckets: [{ localDay: "2026-07-01", activeMs: 3_600_000 }],
  timeBuckets: [
    {
      localDay: "2026-07-01",
      bucketStartHour: 8,
      appKey: "reading",
      activeMs: 3_600_000,
      isFuture: false,
    },
  ],
};

test("renders the reading summary metric strip with an embedded heatmap/graph and no app filter", async () => {
  const period = { unit: "month" as const, anchorLocalDay: "2026-07-01" };
  const getReadingStats = vi.fn().mockResolvedValue(readingStats);

  render(
    <ReadingStatisticsPage period={period} getReadingStats={getReadingStats} />,
  );

  expect(await screen.findByRole("list", { name: "Reading summary" }))
    .toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Heatmap" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Graph" })).toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: "Statistics app" })).toBeNull();
  expect(document.querySelectorAll(".statistics-kpi-card__icon")).toHaveLength(0);
});

test("refetches reading data when the period changes", async () => {
  const july = { unit: "month" as const, anchorLocalDay: "2026-07-01" };
  const followingWeek = { unit: "week" as const, anchorLocalDay: "2026-07-13" };
  const getReadingStats = vi.fn().mockResolvedValue(readingStats);
  const { rerender } = render(
    <ReadingStatisticsPage period={july} getReadingStats={getReadingStats} />,
  );

  await waitFor(() => expect(getReadingStats).toHaveBeenCalledWith(july));

  rerender(
    <ReadingStatisticsPage
      period={followingWeek}
      getReadingStats={getReadingStats}
    />,
  );

  await waitFor(() =>
    expect(getReadingStats).toHaveBeenLastCalledWith(followingWeek),
  );
});

test("retries only the active Reading statistics request", async () => {
  const user = userEvent.setup();
  const period = { unit: "week" as const, anchorLocalDay: "2026-07-13" };
  const getReadingStats = vi.fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(readingStats);
  render(
    <ReadingStatisticsPage
      period={period}
      getReadingStats={getReadingStats}
    />,
  );

  await user.click(await screen.findByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("list", { name: "Reading summary" }))
    .toBeInTheDocument();
  expect(getReadingStats).toHaveBeenCalledTimes(2);
});
