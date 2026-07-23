import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { ActivityChartCard, graphModesForPeriod } from "./ActivityChartCard";

test("derives graph modes that are meaningful for each calendar period", () => {
  expect(graphModesForPeriod({ unit: "week", anchorLocalDay: "2026-06-15" })).toEqual([
    "daily",
    "cumulative",
  ]);
  expect(graphModesForPeriod({ unit: "month", anchorLocalDay: "2026-06-01" })).toEqual([
    "daily",
    "weekly",
    "cumulative",
  ]);
  expect(graphModesForPeriod({ unit: "year", anchorLocalDay: "2026-01-01" })).toEqual([
    "daily",
    "weekly",
    "cumulative",
  ]);
});

test("keeps an available-but-empty heatmap view when switching to a year period", () => {
  render(<ActivityChartCard period={{ unit: "year", anchorLocalDay: "2026-01-01" }} totalBuckets={[]} timeBuckets={[]} series={[]} />);
  expect(screen.getByRole("button", { name: "Heatmap" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Graph" })).toBeInTheDocument();
});

test("keeps a saved personal graph preference when both views are enabled", () => {
  localStorage.setItem("library.statistics.preferences.v1", JSON.stringify({ baseColor: "#3778d4", chartView: "graph" }));
  render(<ActivityChartCard period={{ unit: "month", anchorLocalDay: "2026-07-01" }} totalBuckets={[]} timeBuckets={[]} series={[]} />);
  expect(screen.getByRole("button", { name: "Graph" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Heatmap" })).toBeInTheDocument();
});

test("uses graph only when hourly buckets are unavailable", () => {
  render(<ActivityChartCard period={{ unit: "month", anchorLocalDay: "2026-07-01" }} totalBuckets={[]} series={[]} />);
  expect(screen.queryByRole("button", { name: "Heatmap" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Graph" })).toHaveAttribute("aria-pressed", "true");
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

test("keeps app, view, and an explicit graph mode while the calendar period changes", async () => {
  const user = userEvent.setup();
  const series = [
    { appKey: "reading", title: "Reading", buckets: [{ date: "2026-06-18", value: 30 }] },
  ];
  const { rerender } = render(
    <ActivityChartCard
      period={{ unit: "month", anchorLocalDay: "2026-06-01" }}
      totalBuckets={[{ date: "2026-06-18", value: 60 }]}
      timeBuckets={[]}
      series={series}
    />,
  );

  await user.click(screen.getByRole("combobox", { name: "Statistics app" }));
  await user.click(screen.getByRole("option", { name: "Reading" }));
  await user.click(screen.getByRole("button", { name: "Graph" }));
  await user.click(screen.getByRole("button", { name: "Cumulative" }));

  rerender(
    <ActivityChartCard
      period={{ unit: "year", anchorLocalDay: "2026-01-01" }}
      totalBuckets={[{ date: "2026-06-18", value: 60 }]}
      timeBuckets={[]}
      series={series}
    />,
  );

  expect(screen.getByRole("combobox", { name: "Statistics app" })).toHaveTextContent("Reading");
  expect(screen.getByRole("button", { name: "Graph" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Cumulative" })).toHaveAttribute("aria-pressed", "true");
});

test("does not render chart color controls", () => {
  render(<ActivityChartCard period={{ unit: "month", anchorLocalDay: "2026-07-01" }} totalBuckets={[]} timeBuckets={[]} series={[]} />);

  expect(screen.queryByText("Chart color")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /set chart color/i })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Custom chart color")).not.toBeInTheDocument();
});

test("uses weekly as the Year default and daily as the Week and Month default", () => {
  const { rerender } = render(
    <ActivityChartCard
      period={{ unit: "year", anchorLocalDay: "2026-01-01" }}
      totalBuckets={[{ date: "2026-01-01", value: 1 }]}
      timeBuckets={[]}
      series={[]}
    />,
  );
  expect(screen.getByRole("button", { name: "Weekly" })).toHaveAttribute("aria-pressed", "true");

  rerender(
    <ActivityChartCard
      period={{ unit: "month", anchorLocalDay: "2026-02-01" }}
      totalBuckets={[{ date: "2026-02-01", value: 1 }]}
      timeBuckets={[]}
      series={[]}
    />,
  );
  expect(screen.getByRole("button", { name: "Daily" })).toHaveAttribute("aria-pressed", "true");
});

test("resets an invalid weekly choice to the Week default", async () => {
  const user = userEvent.setup();
  const { rerender } = render(
    <ActivityChartCard
      period={{ unit: "month", anchorLocalDay: "2026-06-01" }}
      totalBuckets={[{ date: "2026-06-18", value: 60 }]}
      timeBuckets={[]}
      series={[]}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Graph" }));
  await user.click(screen.getByRole("button", { name: "Weekly" }));

  rerender(
    <ActivityChartCard
      period={{ unit: "week", anchorLocalDay: "2026-06-15" }}
      totalBuckets={[{ date: "2026-06-18", value: 60 }]}
      timeBuckets={[]}
      series={[]}
    />,
  );

  expect(screen.queryByRole("button", { name: "Weekly" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Daily" })).toHaveAttribute("aria-pressed", "true");
});

test("keeps an explicit cumulative choice when it remains valid after a period change", async () => {
  const user = userEvent.setup();
  const { rerender } = render(
    <ActivityChartCard
      period={{ unit: "month", anchorLocalDay: "2026-06-01" }}
      totalBuckets={[{ date: "2026-06-18", value: 60 }]}
      timeBuckets={[]}
      series={[]}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Graph" }));
  await user.click(screen.getByRole("button", { name: "Cumulative" }));

  rerender(
    <ActivityChartCard
      period={{ unit: "week", anchorLocalDay: "2026-06-15" }}
      totalBuckets={[{ date: "2026-06-18", value: 60 }]}
      timeBuckets={[]}
      series={[]}
    />,
  );

  expect(screen.getByRole("button", { name: "Cumulative" })).toHaveAttribute("aria-pressed", "true");
});

test("keeps graph-only detail routes without a period on their supplied default", () => {
  render(
    <ActivityChartCard
      defaultGraphMode="weekly"
      totalBuckets={[{ date: "2026-06-18", value: 60 }]}
      series={[]}
    />,
  );

  expect(screen.getByRole("button", { name: "Weekly" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Daily" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cumulative" })).toBeInTheDocument();
});

test("uses icon-plus-label view controls", () => {
  render(<ActivityChartCard period={{ unit: "month", anchorLocalDay: "2026-07-01" }} totalBuckets={[]} timeBuckets={[]} series={[]} />);
  expect(screen.getByRole("button", { name: "Heatmap" }).querySelector("svg")).not.toBeNull();
  expect(screen.getByRole("button", { name: "Graph" }).querySelector("svg")).not.toBeNull();
});

test("derives matching selected-app graph totals from hourly buckets while keeping zero calendar days", async () => {
  const user = userEvent.setup();
  localStorage.removeItem("library.statistics.preferences.v1");
  render(
    <ActivityChartCard
      period={{ unit: "week", anchorLocalDay: "2026-07-13" }}
      totalBuckets={[
        { date: "2026-07-13", value: 50 },
        { date: "2026-07-14", value: 0 },
      ]}
      series={[{ appKey: "reading", title: "Reading", buckets: [{ date: "2026-07-13", value: 30 }] }]}
      appOptions={[
        { appKey: "reading", title: "Reading" },
        { appKey: "memora", title: "Memora" },
      ]}
      timeBuckets={[
        { localDay: "2026-07-13", bucketStartHour: 12, activeMs: 30 * 60_000, appKey: "reading", isFuture: false },
        { localDay: "2026-07-13", bucketStartHour: 12, activeMs: 5 * 60_000, appKey: "memora", isFuture: false },
        { localDay: "2026-07-13", bucketStartHour: 16, activeMs: 15 * 60_000, appKey: "memora", isFuture: false },
        { localDay: "2026-07-14", bucketStartHour: 12, activeMs: 30 * 60_000, appKey: "memora", isFuture: true },
      ]}
    />,
  );

  await user.click(screen.getByRole("combobox", { name: "Statistics app" }));
  await user.click(screen.getByRole("option", { name: "Memora" }));
  expect(screen.getByRole("gridcell", { name: /July 13, 2026, 12:00–16:00: 5 minutes/ })).toBeInTheDocument();
  expect(screen.getByRole("gridcell", { name: /July 13, 2026, 16:00–20:00: 15 minutes/ })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Graph" }));
  expect(screen.getByLabelText("2026-07-13: 20 Active time")).toBeInTheDocument();
  expect(screen.getByLabelText("2026-07-14: 0 Active time")).toBeInTheDocument();
});
