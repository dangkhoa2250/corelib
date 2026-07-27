import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { IconClock } from "@tabler/icons-react";
import { formatPeriodComparison, KpiCard } from "./KpiCard";

test("renders icon, value, comparison and accessible sparkline", () => {
  render(
    <KpiCard
      icon={<IconClock />}
      label="Active time"
      value="2h 18m"
      comparison={{ kind: "increase", label: "12% vs previous month" }}
      trend={[10, 16, 14, 24]}
    />,
  );

  expect(screen.getByText("Active time")).toBeInTheDocument();
  expect(screen.getByText("2h 18m")).toBeInTheDocument();
  expect(screen.getByText("12% vs previous month")).toHaveAttribute("data-kind", "increase");
  expect(screen.getByRole("img", { name: "Active time trend" })).toBeInTheDocument();
});

test("renders help text when provided", () => {
  render(<KpiCard icon={<IconClock />} label="Streak" value="5 days" help="Current streak" />);
  expect(screen.getByText("Current streak")).toBeInTheDocument();
});

test("does not render a sparkline for an all-zero trend", () => {
  render(<KpiCard icon={<IconClock />} label="Active days" value="0" trend={[0, 0, 0]} />);
  expect(screen.queryByRole("img", { name: "Active days trend" })).not.toBeInTheDocument();
});

test("formats zero baselines without infinity", () => {
  expect(formatPeriodComparison(0, 0, "month")).toEqual({ kind: "neutral", label: "No change" });
  expect(formatPeriodComparison(60_000, 0, "month")).toEqual({ kind: "increase", label: "New activity" });
});

test("formats declines against the previous calendar period", () => {
  expect(formatPeriodComparison(30, 60, "week")).toEqual({ kind: "decrease", label: "↓ 50% vs previous week" });
});

test("applies the statistics-card class", () => {
  const { container } = render(<KpiCard icon={<IconClock />} label="Test" value="123" />);
  expect(container.firstElementChild).toHaveClass("statistics-card");
});
