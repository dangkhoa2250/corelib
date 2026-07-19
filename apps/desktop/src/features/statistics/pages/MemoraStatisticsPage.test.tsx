import { render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { MemoraStatisticsPage } from "./MemoraStatisticsPage";

const memoraStats = {
  activeMs: 0,
  practiceActiveMs: 0,
  sessionCount: 0,
  realReviews: 0,
  recallRate: null,
  ratingDistribution: { again: 0, hard: 0, good: 0, easy: 0 },
  averageAnswerMs: null,
  cardStates: { new: 0, learning: 0, review: 0, relearning: 0, suspended: 0 },
  lapseRate: null,
  activeDays: 0,
  dueForecast: { today: 0, next7Days: 0, next30Days: 0 },
  buckets: [],
};

test("loads Memora data for the supplied calendar period", async () => {
  const period = { unit: "year" as const, anchorLocalDay: "2026-07-01" };
  const getMemoraStats = vi.fn().mockResolvedValue(memoraStats);

  render(<MemoraStatisticsPage period={period} getMemoraStats={getMemoraStats} />);

  expect(await screen.findByText("Ratings")).toBeInTheDocument();
  await waitFor(() => expect(getMemoraStats).toHaveBeenCalledWith(period));
});
