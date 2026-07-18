import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { KpiCard } from "./KpiCard";

test("renders label and value", () => {
  render(<KpiCard label="Active Time" value="12h 34m" />);
  expect(screen.getByText("Active Time")).toBeInTheDocument();
  expect(screen.getByText("12h 34m")).toBeInTheDocument();
});

test("renders help text when provided", () => {
  render(<KpiCard label="Streak" value="5 days" help="Current streak" />);
  expect(screen.getByText("Current streak")).toBeInTheDocument();
});

test("renders comparison text when provided", () => {
  render(<KpiCard label="Reviews" value="42" comparison="+12% vs last week" />);
  expect(screen.getByText("+12% vs last week")).toBeInTheDocument();
});

test("applies the statistics-card class", () => {
  const { container } = render(<KpiCard label="Test" value="123" />);
  expect(container.firstElementChild).toHaveClass("statistics-card");
});
