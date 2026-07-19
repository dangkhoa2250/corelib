import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { ActivityHeatmap } from "./ActivityHeatmap";

test("renders a date-only heatmap for a calendar period", () => {
  render(<ActivityHeatmap data={{ "2026-07-18": 10 }} period={{ unit: "week", anchorLocalDay: "2026-07-13" }} palette={["#1", "#2", "#3", "#4", "#5"]} />);
  expect(screen.getByRole("grid", { name: "Daily activity" })).toBeInTheDocument();
});
