import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { StatisticsOverviewPage } from "./pages/StatisticsOverviewPage";
import { DEFAULT_STATISTICS_APPS, registerApp, getApp, getAllApps, clearApps } from "./registry";

describe("statisticsAppRegistry", () => {
  test("register and retrieve app", () => {
    clearApps();
    const FakeIcon = () => <svg />;
    registerApp({
      key: "test",
      title: "Test",
      tagline: "A test application.",
      icon: FakeIcon,
      loadSummary: vi.fn(),
      loadDetail: vi.fn(),
    });
    expect(getApp("test")).toBeDefined();
    expect(getAllApps()).toHaveLength(1);
  });

  test("unknown app returns undefined", () => {
    clearApps();
    expect(getApp("nonexistent")).toBeUndefined();
  });

  test("defines user-facing taglines for built-in apps", () => {
    expect(DEFAULT_STATISTICS_APPS).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "reading", tagline: "Stay curious. Keep reading." }),
      expect.objectContaining({ key: "memora", tagline: "Review. Remember. Grow." }),
    ]));
  });

  test("renders a third registry app in overview without an app-key branch", async () => {
    const focusApp = {
      key: "focus",
      title: "Focus",
      tagline: "Make space for focus.",
      icon: () => <svg />,
      loadSummary: vi.fn().mockResolvedValue({
        appKey: "focus",
        primary: { id: "focus-time", label: "Focus time", value: 60_000, unit: "milliseconds" as const },
        secondary: { id: "blocks", label: "Blocks", value: 1, unit: "count" as const },
        buckets: [
          { date: "2026-07-01", value: 0 },
          { date: "2026-07-02", value: 1 },
        ],
      }),
      loadDetail: vi.fn(),
    };
    const overview = {
      activeMs: 0,
      readingActiveMs: 0,
      memoraActiveMs: 0,
      currentStreak: 0,
      activeDays: 0,
      previousActiveMs: 0,
      previousActiveDays: 0,
      buckets: [],
      activeDayBuckets: [],
      timeBuckets: [],
    };

    render(
      <StatisticsOverviewPage
        period={{ unit: "month", anchorLocalDay: "2026-07-01" }}
        onPeriodChange={vi.fn()}
        getOverview={vi.fn().mockResolvedValue(overview)}
        apps={[focusApp]}
        onOpenApp={vi.fn()}
      />,
    );

    expect(await screen.findByRole("article", { name: "Focus statistics" })).toBeInTheDocument();
    expect(screen.getByText("Make space for focus.")).toBeInTheDocument();
    expect(screen.getByText("Focus time")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Focus trend" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Focus statistics" })).toBeInTheDocument();
  });
});
