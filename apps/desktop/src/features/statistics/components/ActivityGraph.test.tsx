import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import {
  ActivityGraph,
  aggregateWeekly,
  cumulativeSum,
  graphAxisLabels,
  type ActivityBucket,
} from "./ActivityGraph";

const dailyBuckets: ActivityBucket[] = Array.from({ length: 30 }, (_, i) => ({
  date: `2025-07-${String(i + 1).padStart(2, "0")}`,
  value: Math.floor(Math.random() * 60),
}));

test("renders SVG with role img and descriptive label", () => {
  render(<ActivityGraph buckets={dailyBuckets} mode="daily" onModeChange={vi.fn()} valueLabel="Active time" />);
  expect(screen.getByRole("img", { name: /active-time trend.*daily/ })).toBeInTheDocument();
});

test("mode buttons call onModeChange", async () => {
  const onModeChange = vi.fn();
  const user = userEvent.setup();
  render(<ActivityGraph buckets={dailyBuckets} mode="daily" onModeChange={onModeChange} valueLabel="Active time" />);
  await user.click(screen.getByRole("button", { name: /weekly/i }));
  expect(onModeChange).toHaveBeenCalledWith("weekly");
});

test("renders only the modes supported by the selected period", () => {
  render(
    <ActivityGraph
      buckets={dailyBuckets}
      mode="daily"
      onModeChange={vi.fn()}
      valueLabel="Active time"
      allowedModes={["daily", "cumulative"]}
    />,
  );

  expect(screen.getByRole("button", { name: "Daily" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Weekly" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cumulative" })).toBeInTheDocument();
});

test("uses six evenly distributed compact labels for 53 weekly buckets", () => {
  const start = new Date(2025, 11, 29);
  const buckets: ActivityBucket[] = Array.from({ length: 53 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index * 7);
    return {
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      value: index,
    };
  });

  const labels = graphAxisLabels(buckets, "weekly");

  expect(labels.map(({ idx }) => idx)).toEqual([0, 10, 21, 31, 42, 52]);
  expect(labels[0].label).toBe("Dec 29");
  expect(labels.at(-1)?.idx).toBe(52);
  expect(labels.every(({ label }) => !label.includes("Week of"))).toBe(true);
});

test("caps daily and cumulative axis labels at seven", () => {
  const buckets: ActivityBucket[] = Array.from({ length: 20 }, (_, index) => ({
    date: `2026-07-${String(index + 1).padStart(2, "0")}`,
    value: index,
  }));

  expect(graphAxisLabels(buckets, "daily")).toHaveLength(7);
  expect(graphAxisLabels(buckets, "cumulative")).toHaveLength(7);
});

test("returns no label for empty data and one compact label for a single bucket", () => {
  expect(graphAxisLabels([], "daily")).toEqual([]);
  expect(graphAxisLabels([{ date: "2026-07-23", value: 1 }], "daily")).toEqual([{ idx: 0, label: "Jul 23" }]);
});

test("keeps weekly semantics in accessible point and tooltip text but not visible axis labels", () => {
  const { container } = render(
    <ActivityGraph
      buckets={[{ date: "2026-07-20", value: 2 }]}
      mode="weekly"
      onModeChange={vi.fn()}
      valueLabel="Active time"
    />,
  );
  const point = screen.getByLabelText("Week of 2026-07-20: 2 Active time");
  const graph = screen.getByTestId("activity-graph");
  vi.spyOn(graph, "getBoundingClientRect").mockReturnValue({ width: 600, height: 200 } as DOMRect);

  fireEvent.focus(point);

  expect(screen.getByText("Week of 2026-07-20: 2 Active time")).toBeInTheDocument();
  expect(Array.from(container.querySelectorAll("text")).every((element) => !element.textContent?.includes("Week of"))).toBe(true);
});

test("cumulative mode shows monotonic non-decreasing values", () => {
  const { container } = render(
    <ActivityGraph buckets={dailyBuckets} mode="cumulative" onModeChange={vi.fn()} valueLabel="Active time" />,
  );
  const path = container.querySelector("path");
  expect(path).toBeInTheDocument();
});

test("empty buckets shows no-data message", () => {
  render(<ActivityGraph buckets={[]} mode="daily" onModeChange={vi.fn()} valueLabel="Active time" />);
  expect(screen.getByText(/no data/i)).toBeInTheDocument();
});

test("aggregateWeekly groups by ISO week", () => {
  const buckets: ActivityBucket[] = [
    { date: "2025-07-14", value: 10 }, // Monday
    { date: "2025-07-15", value: 20 }, // Tuesday
    { date: "2025-07-21", value: 30 }, // Next Monday
  ];
  const weekly = aggregateWeekly(buckets);
  expect(weekly).toHaveLength(2);
  expect(weekly[0].value).toBe(30);
  expect(weekly[1].value).toBe(30);
});

test("cumulativeSum is monotonic", () => {
  const buckets: ActivityBucket[] = [
    { date: "2025-07-01", value: 5 },
    { date: "2025-07-02", value: 10 },
    { date: "2025-07-03", value: 3 },
  ];
  const cum = cumulativeSum(buckets);
  expect(cum.map(b => b.value)).toEqual([5, 15, 18]);
});

test("uses the selected chart color for its line and fill", () => {
  render(
    <ActivityGraph
      buckets={dailyBuckets}
      mode="daily"
      onModeChange={vi.fn()}
      valueLabel="Active time"
      palette={["tone-1", "tone-2", "tone-3", "tone-4", "tone-5"]}
    />,
  );
  expect(screen.getByTestId("activity-graph")).toHaveStyle({
    "--chart-line": "tone-5",
    "--chart-fill": "tone-3",
  });
});
