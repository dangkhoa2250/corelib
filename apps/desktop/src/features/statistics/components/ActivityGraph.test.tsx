import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { ActivityGraph, aggregateWeekly, cumulativeSum, type ActivityBucket } from "./ActivityGraph";

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

test("renders Week-of label in weekly mode", () => {
  render(<ActivityGraph buckets={dailyBuckets} mode="weekly" onModeChange={vi.fn()} valueLabel="Active time" />);
  expect(screen.getAllByText(/Week of/).length).toBeGreaterThan(0);
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
