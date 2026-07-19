import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { ActivityChartCard } from "./ActivityChartCard";

test("keeps the saved heatmap view when switching to a year period", () => {
  render(<ActivityChartCard period={{ unit: "year", anchorLocalDay: "2026-01-01" }} totalBuckets={[]} series={[]} />);
  expect(screen.getByRole("button", { name: "Heatmap" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Graph" })).toBeInTheDocument();
});

test("keeps a saved personal graph preference when both views are enabled", () => {
  localStorage.setItem("library.statistics.preferences.v1", JSON.stringify({ baseColor: "#3778d4", chartView: "graph" }));
  render(<ActivityChartCard period={{ unit: "month", anchorLocalDay: "2026-07-01" }} totalBuckets={[]} series={[]} />);
  expect(screen.getByRole("button", { name: "Graph" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Heatmap" })).toBeInTheDocument();
});

test("can render graph-only data without changing personal heatmap preferences", () => {
  render(<ActivityChartCard heatmapEnabled={false} period={{ unit: "month", anchorLocalDay: "2026-07-01" }} totalBuckets={[{ date: "2026-07-18", value: 60 }]} series={[]} />);
  expect(screen.queryByRole("button", { name: "Heatmap" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Graph" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByLabelText("2026-07-18: 60 Active time")).toBeInTheDocument();
});
