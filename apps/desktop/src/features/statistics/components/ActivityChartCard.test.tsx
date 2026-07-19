import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { ActivityChartCard } from "./ActivityChartCard";

test("uses weekly graph mode for a year period", () => {
  render(<ActivityChartCard period={{ unit: "year", anchorLocalDay: "2026-01-01" }} totalBuckets={[]} series={[]} />);
  expect(screen.getByRole("button", { name: "Graph" })).toHaveAttribute("aria-pressed", "true");
});
