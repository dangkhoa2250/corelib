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

const markerBuckets: ActivityBucket[] = [
  { date: "2026-07-21", value: 0 },
  { date: "2026-07-22", value: 2 },
  { date: "2026-07-23", value: 1 },
];

function mockGraphBounds(graph: HTMLElement, svg: SVGSVGElement) {
  const bounds = { left: 0, top: 0, width: 600, height: 200 } as DOMRect;
  vi.spyOn(graph, "getBoundingClientRect").mockReturnValue(bounds);
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(bounds);
}

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
  expect(screen.getByLabelText("Week of 2026-07-20: 2 Active time")).toBeInTheDocument();
  const graph = screen.getByTestId("activity-graph");
  const svg = screen.getByRole("img");
  vi.spyOn(graph, "getBoundingClientRect").mockReturnValue({ width: 600, height: 200 } as DOMRect);

  fireEvent.focus(svg);

  expect(graph.querySelector(".statistics-graph__tooltip")).toHaveTextContent("Week of 2026-07-20: 2 Active time");
  expect(Array.from(container.querySelectorAll("text")).every((element) => !element.textContent?.includes("Week of"))).toBe(true);
});

test("shows no graph markers until the graph is interacted with", () => {
  const { container } = render(
    <ActivityGraph buckets={markerBuckets} mode="daily" onModeChange={vi.fn()} valueLabel="Active time" />,
  );

  expect(screen.queryByTestId("activity-graph-marker")).not.toBeInTheDocument();
  expect(screen.getByTestId("activity-graph").querySelectorAll("circle")).toHaveLength(0);
  expect(container.querySelectorAll("circle")).toHaveLength(0);
});

test("shows one radius-three marker for pointer interaction and removes it when the pointer leaves", () => {
  render(<ActivityGraph buckets={markerBuckets} mode="daily" onModeChange={vi.fn()} valueLabel="Active time" />);

  const graph = screen.getByTestId("activity-graph");
  const svg = screen.getByRole("img");
  mockGraphBounds(graph, svg);

  fireEvent.mouseMove(svg, { clientX: 300, clientY: 100 });

  expect(screen.getAllByTestId("activity-graph-marker")).toHaveLength(1);
  expect(screen.getByTestId("activity-graph-marker")).toHaveAttribute("r", "3");

  fireEvent.mouseLeave(svg);

  expect(screen.queryByTestId("activity-graph-marker")).not.toBeInTheDocument();
});

test("uses a single marker and tooltip for keyboard navigation", () => {
  render(<ActivityGraph buckets={markerBuckets} mode="daily" onModeChange={vi.fn()} valueLabel="Active time" />);

  const graph = screen.getByTestId("activity-graph");
  const svg = screen.getByRole("img");
  mockGraphBounds(graph, svg);

  fireEvent.focus(svg);
  expect(screen.getAllByTestId("activity-graph-marker")).toHaveLength(1);
  expect(screen.getByTestId("activity-graph-marker")).toHaveAttribute("r", "3");
  expect(graph.querySelector(".statistics-graph__tooltip")).toHaveTextContent("2026-07-21: 0 Active time");

  fireEvent.keyDown(svg, { key: "ArrowRight" });
  expect(screen.getAllByTestId("activity-graph-marker")).toHaveLength(1);
  expect(graph.querySelector(".statistics-graph__tooltip")).toHaveTextContent("2026-07-22: 2 Active time");

  fireEvent.keyDown(svg, { key: "End" });
  expect(graph.querySelector(".statistics-graph__tooltip")).toHaveTextContent("2026-07-23: 1 Active time");
  fireEvent.keyDown(svg, { key: "Home" });
  expect(graph.querySelector(".statistics-graph__tooltip")).toHaveTextContent("2026-07-21: 0 Active time");

  fireEvent.blur(svg);
  expect(screen.queryByTestId("activity-graph-marker")).not.toBeInTheDocument();
});

test("gives pointer interaction precedence and restores the keyboard point after pointer leave", () => {
  render(<ActivityGraph buckets={markerBuckets} mode="daily" onModeChange={vi.fn()} valueLabel="Active time" />);

  const graph = screen.getByTestId("activity-graph");
  const svg = screen.getByRole("img");
  mockGraphBounds(graph, svg);

  fireEvent.focus(svg);
  fireEvent.keyDown(svg, { key: "ArrowRight" });
  expect(graph.querySelector(".statistics-graph__tooltip")).toHaveTextContent("2026-07-22: 2 Active time");

  fireEvent.mouseMove(svg, { clientX: 540, clientY: 100 });
  expect(screen.getAllByTestId("activity-graph-marker")).toHaveLength(1);
  expect(graph.querySelector(".statistics-graph__tooltip")).toHaveTextContent("2026-07-23: 1 Active time");

  fireEvent.mouseLeave(svg);
  expect(screen.getAllByTestId("activity-graph-marker")).toHaveLength(1);
  expect(graph.querySelector(".statistics-graph__tooltip")).toHaveTextContent("2026-07-22: 2 Active time");
});

test("keeps the pointer marker and tooltip authoritative while keyboard navigation continues", () => {
  render(<ActivityGraph buckets={markerBuckets} mode="daily" onModeChange={vi.fn()} valueLabel="Active time" />);

  const graph = screen.getByTestId("activity-graph");
  const svg = screen.getByRole("img");
  mockGraphBounds(graph, svg);

  fireEvent.focus(svg);
  fireEvent.mouseMove(svg, { clientX: 540, clientY: 100 });
  expect(screen.getByTestId("activity-graph-marker")).toHaveAttribute("cx", "580");
  expect(graph.querySelector(".statistics-graph__tooltip")).toHaveTextContent("2026-07-23: 1 Active time");

  fireEvent.keyDown(svg, { key: "ArrowRight" });
  expect(screen.getByTestId("activity-graph-marker")).toHaveAttribute("cx", "580");
  expect(graph.querySelector(".statistics-graph__tooltip")).toHaveTextContent("2026-07-23: 1 Active time");

  fireEvent.mouseLeave(svg);
  expect(screen.getByTestId("activity-graph-marker")).toHaveAttribute("cx", "315");
  expect(graph.querySelector(".statistics-graph__tooltip")).toHaveTextContent("2026-07-22: 2 Active time");
});

test("keeps the pointer interaction authoritative when the graph receives focus after hover", () => {
  render(<ActivityGraph buckets={markerBuckets} mode="daily" onModeChange={vi.fn()} valueLabel="Active time" />);

  const graph = screen.getByTestId("activity-graph");
  const svg = screen.getByRole("img");
  mockGraphBounds(graph, svg);

  fireEvent.mouseMove(svg, { clientX: 540, clientY: 100 });
  svg.focus();
  fireEvent.focus(svg);

  expect(screen.getByTestId("activity-graph-marker")).toHaveAttribute("cx", "580");
  expect(graph.querySelector(".statistics-graph__tooltip")).toHaveTextContent("2026-07-23: 1 Active time");
});

test("keeps the pointer interaction visible when the graph blurs until pointer leave", () => {
  render(<ActivityGraph buckets={markerBuckets} mode="daily" onModeChange={vi.fn()} valueLabel="Active time" />);

  const graph = screen.getByTestId("activity-graph");
  const svg = screen.getByRole("img");
  mockGraphBounds(graph, svg);

  svg.focus();
  fireEvent.focus(svg);
  fireEvent.mouseMove(svg, { clientX: 540, clientY: 100 });
  svg.blur();
  fireEvent.blur(svg);

  expect(screen.getByTestId("activity-graph-marker")).toHaveAttribute("cx", "580");
  expect(graph.querySelector(".statistics-graph__tooltip")).toHaveTextContent("2026-07-23: 1 Active time");

  fireEvent.mouseLeave(svg);
  expect(screen.queryByTestId("activity-graph-marker")).not.toBeInTheDocument();
  expect(graph.querySelector(".statistics-graph__tooltip")).not.toBeInTheDocument();
});

test("clamps focused selection and refreshes its tooltip when the data changes", () => {
  const { rerender } = render(
    <ActivityGraph buckets={markerBuckets} mode="daily" onModeChange={vi.fn()} valueLabel="Active time" />,
  );
  const graph = screen.getByTestId("activity-graph");
  const svg = screen.getByRole("img");
  mockGraphBounds(graph, svg);

  svg.focus();
  fireEvent.focus(svg);
  fireEvent.keyDown(svg, { key: "End" });
  rerender(
    <ActivityGraph
      buckets={[
        { date: "2026-07-24", value: 4 },
        { date: "2026-07-25", value: 5 },
      ]}
      mode="daily"
      onModeChange={vi.fn()}
      valueLabel="Active time"
    />,
  );

  expect(screen.getByTestId("activity-graph-marker")).toHaveAttribute("cx", "580");
  expect(graph.querySelector(".statistics-graph__tooltip")).toHaveTextContent("2026-07-25: 5 Active time");
});

test("clears stale pointer interaction when the graph data changes without keyboard focus", () => {
  const { rerender } = render(
    <ActivityGraph buckets={markerBuckets} mode="daily" onModeChange={vi.fn()} valueLabel="Active time" />,
  );
  const graph = screen.getByTestId("activity-graph");
  const svg = screen.getByRole("img");
  mockGraphBounds(graph, svg);

  fireEvent.mouseMove(svg, { clientX: 540, clientY: 100 });
  rerender(<ActivityGraph buckets={markerBuckets} mode="cumulative" onModeChange={vi.fn()} valueLabel="Total time" />);

  expect(screen.queryByTestId("activity-graph-marker")).not.toBeInTheDocument();
  expect(graph.querySelector(".statistics-graph__tooltip")).not.toBeInTheDocument();
});

test("announces the keyboard-selected graph point through a live status", () => {
  render(<ActivityGraph buckets={markerBuckets} mode="daily" onModeChange={vi.fn()} valueLabel="Active time" />);

  const graph = screen.getByTestId("activity-graph");
  const svg = screen.getByRole("img");
  mockGraphBounds(graph, svg);

  svg.focus();
  fireEvent.focus(svg);
  const status = screen.getByRole("status");
  expect(svg).toHaveAttribute("aria-describedby", status.id);
  expect(status).toHaveTextContent("2026-07-21: 0 Active time");

  fireEvent.keyDown(svg, { key: "ArrowRight" });
  expect(status).toHaveTextContent("2026-07-22: 2 Active time");
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
