import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { DocumentStatisticsPage } from "./DocumentStatisticsPage";
test("loads document data for its calendar period", async () => { render(<DocumentStatisticsPage documentId="doc" period={{ unit: "month", anchorLocalDay: "2026-07-01" }} getDocStats={vi.fn().mockResolvedValue({ documentId: "doc", activeMs: 0, sessionCount: 0, averageSessionMs: null, pageVisits: 0, uniquePages: 0, revisits: 0, coverage: 0, realReviews: 0, recallRate: null, againCount: 0, lapses: 0, buckets: [] })} />); expect(await screen.findByText("Coverage")).toBeInTheDocument(); });
