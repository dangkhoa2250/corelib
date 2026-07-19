import { render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ReadingStatisticsPage } from "./ReadingStatisticsPage";

const readingStats = {
  activeMs: 0,
  sessionCount: 0,
  averageSessionMs: null,
  pageVisits: 0,
  uniquePages: 0,
  revisits: 0,
  buckets: [],
};

test("loads reading data for the supplied calendar period and refetches on period change", async () => {
  const july = { unit: "month" as const, anchorLocalDay: "2026-07-01" };
  const followingWeek = { unit: "week" as const, anchorLocalDay: "2026-07-13" };
  const getReadingStats = vi.fn().mockResolvedValue(readingStats);
  const { rerender } = render(
    <ReadingStatisticsPage period={july} getReadingStats={getReadingStats} />,
  );

  expect(await screen.findByText("0m")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Heatmap" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Graph" })).toHaveAttribute("aria-pressed", "true");
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
