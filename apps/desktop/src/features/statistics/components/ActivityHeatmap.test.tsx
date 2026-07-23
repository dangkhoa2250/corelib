import { fireEvent, render, screen } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { StatisticsTimeBucket } from "../../../domain/statistics";
import { ActivityHeatmap, buildHeatmapColumns, sampleAxisLabelSpans } from "./ActivityHeatmap";

const palette = ["tone-1", "tone-2", "tone-3", "tone-4", "tone-5"];
const week = { unit: "week" as const, anchorLocalDay: "2026-07-13" };
const month = { unit: "month" as const, anchorLocalDay: "2026-02-01" };
const year = { unit: "year" as const, anchorLocalDay: "2026-01-01" };

function bucket(
  localDay: string,
  bucketStartHour: StatisticsTimeBucket["bucketStartHour"],
  activeMs: number,
  appKey: StatisticsTimeBucket["appKey"] = "reading",
): StatisticsTimeBucket {
  return { localDay, bucketStartHour, activeMs, appKey, isFuture: false };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 19, 12));
});

afterEach(() => vi.useRealTimers());

test("renders six four-hour rows, boundary labels, and seven date columns for Week", () => {
  render(<ActivityHeatmap period={week} buckets={[]} selectedApp="all" palette={palette} />);

  expect(screen.getAllByRole("row")).toHaveLength(6);
  expect(screen.getAllByRole("gridcell")).toHaveLength(42);
  for (const label of ["0h", "4h", "8h", "12h", "16h", "20h", "24h"]) {
    expect(screen.getByText(label)).toBeInTheDocument();
  }
  expect(screen.getByRole("grid", { name: "Activity by time" })).toBeInTheDocument();
});

test("uses truthful no-activity summaries instead of inventing a peak time", () => {
  render(<ActivityHeatmap period={week} buckets={[]} selectedApp="all" palette={palette} />);
  expect(screen.getByTestId("activity-heatmap-summary")).toHaveTextContent("No activity yet. No peak time yet.");
  expect(screen.getByText(/Activity summary:/)).toHaveTextContent("No peak time yet");
  expect(screen.getByRole("tooltip")).toHaveTextContent("Focus or hover a cell");
});

test("renders one date column per Month day and one ISO-week column per Year week", () => {
  const { rerender } = render(
    <ActivityHeatmap period={month} buckets={[]} selectedApp="all" palette={palette} />,
  );
  expect(screen.getAllByRole("gridcell")).toHaveLength(28 * 6);

  rerender(<ActivityHeatmap period={year} buckets={[]} selectedApp="all" palette={palette} />);
  expect(screen.getAllByRole("gridcell")).toHaveLength(53 * 6);
});

test("keeps all 54 ISO weeks that intersect a leap year beginning on Sunday", () => {
  expect(buildHeatmapColumns({ unit: "year", anchorLocalDay: "2012-01-01" }, [], "all", "2012-12-31")).toHaveLength(54);
});

test("gives sampled Year labels room by spanning through the next label", () => {
  expect(sampleAxisLabelSpans(54)).toEqual([
    { index: 0, span: 8 },
    { index: 8, span: 8 },
    { index: 16, span: 8 },
    { index: 24, span: 8 },
    { index: 32, span: 8 },
    { index: 40, span: 8 },
    { index: 48, span: 6 },
  ]);
  expect(sampleAxisLabelSpans(7)).toEqual([
    { index: 0, span: 1 },
    { index: 1, span: 1 },
    { index: 2, span: 1 },
    { index: 3, span: 1 },
    { index: 4, span: 1 },
    { index: 5, span: 1 },
    { index: 6, span: 1 },
  ]);
});

test("aggregates matching calendar days into ISO-week time buckets in Year view", () => {
  const columns = buildHeatmapColumns(year, [
    bucket("2026-07-13", 12, 10 * 60_000),
    bucket("2026-07-14", 12, 20 * 60_000),
  ], "all");

  const julyWeek = columns.find((column) => column.key === "2026-07-13");
  expect(julyWeek?.slots.find((slot) => slot.bucketStartHour === 12)?.activeMs).toBe(30 * 60_000);
  expect(julyWeek?.ariaLabel).toMatch(/Week of July 13–July 19, 2026/);
});

test("labels partial first and last ISO weeks with only their included calendar-year dates", () => {
  const columns = buildHeatmapColumns(year, [
    bucket("2026-01-01", 0, 10 * 60_000),
    bucket("2026-01-04", 0, 20 * 60_000),
    bucket("2026-12-28", 20, 30 * 60_000),
    bucket("2026-12-31", 20, 40 * 60_000),
  ], "all", "2026-12-31");

  const first = columns[0];
  const last = columns[columns.length - 1];
  expect(first.localDays).toEqual(["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"]);
  expect(first.ariaLabel).toBe("Week of January 1–January 4, 2026");
  expect(first.slots.find((slot) => slot.bucketStartHour === 0)?.activeMs).toBe(30 * 60_000);
  expect(last?.localDays).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31"]);
  expect(last?.ariaLabel).toBe("Week of December 28–December 31, 2026");
  expect(last?.slots.find((slot) => slot.bucketStartHour === 20)?.activeMs).toBe(70 * 60_000);
});

test("retains each contributing day for Year summaries", () => {
  render(
    <ActivityHeatmap
      period={year}
      buckets={[
        bucket("2026-07-13", 12, 10 * 60_000),
        bucket("2026-07-14", 12, 20 * 60_000),
      ]}
      selectedApp="all"
      palette={palette}
    />,
  );
  expect(screen.getByTestId("activity-heatmap-summary")).toHaveTextContent("30 minutes across 2 active days");
});

test("filters active-time totals and app breakdowns to the selected app", () => {
  const buckets = [
    bucket("2026-07-13", 0, 10 * 60_000, "reading"),
    bucket("2026-07-13", 0, 20 * 60_000, "memora"),
  ];
  render(<ActivityHeatmap period={week} buckets={buckets} selectedApp="reading" palette={palette} />);

  expect(screen.getByRole("gridcell", { name: /July 13, 2026, 00:00–04:00: 10 minutes.*Reading/ })).toHaveAttribute("data-level", "1");
  expect(screen.getByTestId("activity-heatmap-summary")).toHaveTextContent("10 minutes across 1 active day");
});

test("includes app breakdowns in the all-apps cell description", () => {
  render(
    <ActivityHeatmap
      period={week}
      buckets={[
        bucket("2026-07-13", 0, 10 * 60_000, "reading"),
        bucket("2026-07-13", 0, 20 * 60_000, "memora"),
      ]}
      selectedApp="all"
      palette={palette}
    />,
  );
  expect(screen.getByRole("gridcell", { name: /30 minutes.*Reading: 10 minutes, Memora: 20 minutes/ })).toBeInTheDocument();
});

test("uses stable time-based intensity bands instead of a relative score", () => {
  render(
    <ActivityHeatmap
      period={week}
      buckets={[
        bucket("2026-07-13", 0, 1 * 60_000),
        bucket("2026-07-13", 4, 120 * 60_000),
      ]}
      selectedApp="all"
      palette={palette}
    />,
  );

  expect(screen.getByRole("gridcell", { name: /July 13, 2026, 00:00–04:00/ })).toHaveAttribute("data-level", "1");
  expect(screen.getByRole("gridcell", { name: /July 13, 2026, 04:00–08:00/ })).toHaveAttribute("data-level", "5");
});

test("marks future dates unavailable and excludes them from totals", () => {
  vi.setSystemTime(new Date(2026, 6, 15, 12));
  render(
    <ActivityHeatmap
      period={week}
      buckets={[bucket("2026-07-17", 0, 60 * 60_000)]}
      selectedApp="all"
      palette={palette}
    />,
  );

  expect(screen.getByRole("gridcell", { name: /July 17, 2026, 00:00–04:00: Unavailable/ })).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByTestId("activity-heatmap-summary")).toHaveTextContent("No activity yet. No peak time yet.");
});

test("shows exact tooltip text and a visible plus screen-reader summary", () => {
  render(
    <ActivityHeatmap
      period={week}
      buckets={[bucket("2026-07-13", 12, 15 * 60_000)]}
      selectedApp="all"
      palette={palette}
    />,
  );

  const cell = screen.getByRole("gridcell", { name: /July 13, 2026, 12:00–16:00: 15 minutes/ });
  fireEvent.mouseEnter(cell);
  expect(screen.getByRole("tooltip")).toHaveTextContent("July 13, 2026, 12:00–16:00: 15 minutes of activity");
  expect(screen.getByTestId("activity-heatmap-summary")).toHaveTextContent("Strongest time: 12:00–16:00");
  expect(screen.getByText(/Activity summary:/)).toHaveTextContent("Highest day: July 13, 2026");
});

test("updates hover details without rerendering the heatmap grid", () => {
  const onRender = vi.fn();
  render(
    <Profiler id="heatmap" onRender={onRender}>
      <ActivityHeatmap
        period={month}
        buckets={[bucket("2026-02-01", 12, 15 * 60_000)]}
        selectedApp="all"
        palette={palette}
      />
    </Profiler>,
  );
  onRender.mockClear();

  fireEvent.mouseEnter(
    screen.getByRole("gridcell", { name: /February 1, 2026, 12:00–16:00: 15 minutes/ }),
  );

  expect(screen.getByRole("tooltip")).toHaveTextContent("February 1, 2026, 12:00–16:00: 15 minutes of activity");
  expect(onRender).not.toHaveBeenCalled();
});

test("moves roving focus across period columns and time rows", () => {
  render(<ActivityHeatmap period={week} buckets={[]} selectedApp="all" palette={palette} />);

  const cell = screen.getByRole("gridcell", { name: /July 13, 2026, 00:00–04:00/ });
  cell.focus();
  fireEvent.keyDown(cell, { key: "ArrowRight" });
  fireEvent.keyDown(screen.getByRole("gridcell", { name: /July 14, 2026, 00:00–04:00/ }), { key: "ArrowDown" });
  expect(screen.getByRole("gridcell", { name: /July 14, 2026, 04:00–08:00/ })).toHaveFocus();
});
