import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

test("filters activity with the shared non-searchable app combobox", async () => {
  const user = userEvent.setup();
  const { container } = render(
    <ActivityChartCard
      heatmapEnabled={false}
      totalBuckets={[{ date: "2026-07-18", value: 60 }]}
      series={[
        { appKey: "reading", title: "Reading", buckets: [{ date: "2026-07-18", value: 30 }] },
      ]}
    />,
  );

  expect(container.querySelector("select")).toBeNull();
  const filter = screen.getByRole("combobox", { name: "Statistics app" });
  expect(filter.parentElement).toHaveClass("statistics-app-filter");
  await user.click(filter);
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.getByRole("option", { name: "All apps" })).toBeInTheDocument();
  await user.click(screen.getByRole("option", { name: "Reading" }));
  expect(screen.getByLabelText("2026-07-18: 30 Active time")).toBeInTheDocument();
  expect(screen.queryByLabelText("2026-07-18: 60 Active time")).not.toBeInTheDocument();
});
