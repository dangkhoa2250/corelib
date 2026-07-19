import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ReadingStatisticsPage } from "./ReadingStatisticsPage";
test("loads reading data for its calendar period", async () => { render(<ReadingStatisticsPage period={{ unit: "month", anchorLocalDay: "2026-07-01" }} getReadingStats={vi.fn().mockResolvedValue({ activeMs: 0, sessionCount: 0, averageSessionMs: null, pageVisits: 0, uniquePages: 0, revisits: 0, buckets: [] })} />); expect(await screen.findByText("0m")).toBeInTheDocument(); });
