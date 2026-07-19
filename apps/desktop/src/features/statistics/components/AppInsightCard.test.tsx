import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AppInsightCard } from "./AppInsightCard";
import type { AppStatisticsSummary, StatisticsAppDefinition } from "../registry";

const readingDefinition = {
  key: "reading",
  title: "Reading",
  tagline: "Stay curious. Keep reading.",
  icon: () => <svg />,
  loadSummary: vi.fn(),
  loadDetail: vi.fn(),
} as unknown as StatisticsAppDefinition;

const readingSummary: AppStatisticsSummary = {
  appKey: "reading",
  primary: { id: "active-time", label: "Active time", value: 120_000, unit: "milliseconds" },
  secondary: { id: "sessions", label: "Sessions", value: 2, unit: "count" },
  buckets: [
    { date: "2026-07-01", value: 1 },
    { date: "2026-07-02", value: 2 },
  ],
};

test("renders registry tagline, metrics, mini trend and detail affordance", () => {
  const onOpen = vi.fn();

  render(
    <AppInsightCard
      app={readingDefinition}
      summary={readingSummary}
      state="loaded"
      onOpen={onOpen}
    />,
  );

  expect(screen.getByText("Stay curious. Keep reading.")).toBeInTheDocument();
  expect(screen.getByText("Active time")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Reading trend" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open Reading statistics" })).toBeInTheDocument();
  expect(screen.getByRole("article", { name: "Reading statistics" })).toBeInTheDocument();
});

test("keeps loading, error, and empty summaries truthful", () => {
  const { rerender } = render(
    <AppInsightCard app={readingDefinition} summary={null} state="loading" />,
  );
  expect(screen.getByText("Loading…")).toBeInTheDocument();
  expect(screen.queryByRole("img", { name: "Reading trend" })).not.toBeInTheDocument();

  rerender(<AppInsightCard app={readingDefinition} summary={null} state="error" />);
  expect(screen.getByText("Statistics unavailable")).toBeInTheDocument();

  rerender(<AppInsightCard app={readingDefinition} summary={null} state="loaded" />);
  expect(screen.getByText("No activity in this period")).toBeInTheDocument();
});
