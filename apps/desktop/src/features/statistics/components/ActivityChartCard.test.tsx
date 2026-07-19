import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ActivityChartCard } from "./ActivityChartCard";
import type { ActivityChartSeries } from "../registry";

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2025-07-19T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

test("renders heatmap by default", () => {
  render(<ActivityChartCard range="30d" totalBuckets={[]} series={[]} />);
  expect(
    screen.getByRole("grid", { name: /daily activity/i }),
  ).toBeInTheDocument();
});

test("switches to graph view", async () => {
  const user = userEvent.setup();
  const mockBuckets = Array.from({ length: 7 }, (_, i) => ({
    date: `2025-07-${String(13 + i).padStart(2, "0")}`,
    value: 30,
  }));
  render(
    <ActivityChartCard range="30d" totalBuckets={mockBuckets} series={[]} />,
  );
  await user.click(screen.getByRole("button", { name: /graph/i }));
  expect(
    screen.getByRole("img", { name: /active-time trend/i }),
  ).toBeInTheDocument();
});

test("range default graph mode: 1y uses weekly", () => {
  render(<ActivityChartCard range="1y" totalBuckets={[]} series={[]} />);
  expect(
    screen.getByRole("button", { name: /weekly/i }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("app filter dropdown renders with all apps option", () => {
  const series: ActivityChartSeries[] = [
    { appKey: "reading", title: "Reading", buckets: [] },
    { appKey: "memora", title: "Memora", buckets: [] },
  ];
  render(
    <ActivityChartCard range="30d" totalBuckets={[]} series={series} />,
  );
  expect(screen.getByLabelText(/Statistics app/i)).toBeInTheDocument();
  expect(screen.getByRole("option", { name: /all apps/i })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: /reading/i })).toBeInTheDocument();
});

test("derives chart shades from the data-theme attribute", async () => {
  document.documentElement.dataset.theme = "dark";
  const { container } = render(<ActivityChartCard range="30d" totalBuckets={[]} series={[]} />);
  const heatmap = container.querySelector<HTMLElement>(".statistics-heatmap-wrapper");
  expect(heatmap?.style.getPropertyValue("--statistics-level-1")).toContain("28%");
  document.documentElement.dataset.theme = "light";
});
