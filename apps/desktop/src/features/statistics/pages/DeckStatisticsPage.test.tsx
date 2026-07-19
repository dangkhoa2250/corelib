import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { DeckStatisticsPage } from "./DeckStatisticsPage";
test("loads deck data for its calendar period", async () => { render(<DeckStatisticsPage deckId="deck" period={{ unit: "month", anchorLocalDay: "2026-07-01" }} getDeckStats={vi.fn().mockResolvedValue({ deckId: "deck", activeMs: 0, sessionCount: 0, realReviews: 0, recallRate: null, ratingDistribution: { again: 0, hard: 0, good: 0, easy: 0 }, averageAnswerMs: null, cardStates: { new: 0, learning: 0, review: 0, relearning: 0, suspended: 0 }, lapseRate: null, dueForecast: { today: 0, next7Days: 0, next30Days: 0 }, buckets: [] })} />); expect(await screen.findByText("Ratings")).toBeInTheDocument(); });
