import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { MemoraStatisticsPage } from "./MemoraStatisticsPage";
test("loads Memora data for its calendar period", async () => { render(<MemoraStatisticsPage period={{ unit: "month", anchorLocalDay: "2026-07-01" }} getMemoraStats={vi.fn().mockResolvedValue({ activeMs: 0, practiceActiveMs: 0, sessionCount: 0, realReviews: 0, recallRate: null, ratingDistribution: { again: 0, hard: 0, good: 0, easy: 0 }, averageAnswerMs: null, cardStates: { new: 0, learning: 0, review: 0, relearning: 0, suspended: 0 }, lapseRate: null, activeDays: 0, dueForecast: { today: 0, next7Days: 0, next30Days: 0 }, buckets: [] })} />); expect(await screen.findByText("Ratings")).toBeInTheDocument(); });
