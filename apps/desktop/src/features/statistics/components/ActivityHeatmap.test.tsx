import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ActivityHeatmap } from "./ActivityHeatmap";

const MOCK_NOW = new Date("2025-07-19T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(MOCK_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

const mockData: Record<string, number> = {
  "2025-07-17": 42,
  "2025-07-18": 0,
  "2025-07-19": 130,
};

const mockPalette = ["#a1d4a1", "#6bb86b", "#3d9c3d", "#218021", "#006400"];

test("renders a grid with aria-label", () => {
  render(<ActivityHeatmap data={mockData} range="7d" palette={mockPalette} />);
  expect(screen.getByRole("grid", { name: "Daily activity" })).toBeInTheDocument();
});

test("sets cell data-level based on minutes", () => {
  render(<ActivityHeatmap data={mockData} range="7d" palette={mockPalette} />);
  const cell = screen.getByRole("gridcell", { name: /July 17.*42 minutes/ });
  expect(cell).toHaveAttribute("data-level", "3");
});

test("arrow keys move focus through cells", async () => {
  const user = userEvent.setup();
  render(<ActivityHeatmap data={mockData} range="7d" palette={mockPalette} />);
  const july17 = screen.getByRole("gridcell", { name: /July 17/ });
  july17.focus();
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("gridcell", { name: /July 18/ })).toHaveFocus();
});

test("renders hidden summary with active days", () => {
  render(<ActivityHeatmap data={mockData} range="30d" palette={mockPalette} />);
  expect(screen.getByText(/active days/)).toBeInTheDocument();
});

test("all-time range renders at most 3 grids for 5 years of data", () => {
  const bigData: Record<string, number> = {};
  for (let y = 2022; y <= 2026; y++) {
    for (let m = 1; m <= 12; m++) {
      bigData[`${y}-${String(m).padStart(2, "0")}-15`] = 30;
    }
  }
  render(<ActivityHeatmap data={bigData} range="all" palette={mockPalette} />);
  expect(screen.getAllByRole("grid", { name: "Daily activity" })).toHaveLength(3);
});
