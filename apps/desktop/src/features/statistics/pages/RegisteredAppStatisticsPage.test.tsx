import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { RegisteredAppStatisticsPage } from "./RegisteredAppStatisticsPage";

test("loads registered app detail with the exact calendar period", async () => {
  const period = { unit: "week" as const, anchorLocalDay: "2026-07-13" };
  const loadDetail = vi.fn().mockResolvedValue({ appKey: "test", metrics: [], buckets: [] });
  render(<RegisteredAppStatisticsPage period={period} app={{ key: "test", title: "Test", icon: () => null, loadSummary: vi.fn(), loadDetail }} />);
  expect(await screen.findByText("Overview")).toBeInTheDocument();
  expect(loadDetail).toHaveBeenCalledWith(period);
});
