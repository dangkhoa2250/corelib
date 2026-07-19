import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { ActivityChartCard } from "./ActivityChartCard";

test("keeps the saved heatmap view when switching to a year period", () => {
  render(<ActivityChartCard period={{ unit: "year", anchorLocalDay: "2026-01-01" }} totalBuckets={[]} series={[]} />);
  expect(screen.getByRole("button", { name: "Heatmap" })).toHaveAttribute("aria-pressed", "true");
});
