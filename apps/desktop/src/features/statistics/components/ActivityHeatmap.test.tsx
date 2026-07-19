import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { ActivityHeatmap } from "./ActivityHeatmap";

test("renders a date-only heatmap for a calendar period", () => {
  render(<ActivityHeatmap data={{ "2026-07-18": 10 }} period={{ unit: "week", anchorLocalDay: "2026-07-13" }} palette={["#1", "#2", "#3", "#4", "#5"]} />);
  expect(screen.getByRole("grid", { name: "Daily activity" })).toBeInTheDocument();
});

test("uses the selected historical week, month, and year anchors", () => {
  const palette = ["#1", "#2", "#3", "#4", "#5"];
  const { rerender } = render(<ActivityHeatmap data={{ "2020-07-13": 10 }} period={{ unit: "week", anchorLocalDay: "2020-07-13" }} palette={palette} />);
  expect(screen.getByLabelText(/July 13, 2020/)).toBeInTheDocument();

  rerender(<ActivityHeatmap data={{ "2020-02-01": 10 }} period={{ unit: "month", anchorLocalDay: "2020-02-01" }} palette={palette} />);
  expect(screen.getByLabelText(/February 1, 2020/)).toBeInTheDocument();

  rerender(<ActivityHeatmap data={{ "2020-12-31": 10 }} period={{ unit: "year", anchorLocalDay: "2020-01-01" }} palette={palette} />);
  expect(screen.getByText("2020")).toBeInTheDocument();
  expect(screen.getByLabelText(/December 31, 2020/)).toBeInTheDocument();
});
