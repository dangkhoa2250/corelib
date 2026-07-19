import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AdminAnalyticsPage } from "./AdminAnalyticsPage";
import type { AdminStatistics } from "../../domain/account";

const mockAdminStats: AdminStatistics = {
  approvedUsers: 8,
  analyticsEnabledUsers: 5,
  optInPercentage: 62.5,
  contributingUsers: 5,
  insufficientSample: false,
  dau: 12.4,
  wau: 45.2,
  mau: 120.0,
  activeMs: 36000000,
  activeDays: 145,
  averageActiveMs: 7200000,
  averageActiveDays: 29.0,
  appAllocation: { reading: 60.0, memora: 40.0 },
  reading: {
    contributingUsers: 5, insufficientSample: false,
    activeUsers: 5, activeMs: 21600000, sessionCount: 30, pageVisitCount: 200, returningUserRate: 0.8,
  },
  memora: {
    contributingUsers: 5, insufficientSample: false,
    activeUsers: 4, activeMs: 14400000, sessionCount: 20, realReviewCount: 500,
    againCount: 50, hardCount: 80, goodCount: 300, easyCount: 70, lapseCount: 30,
    recallRate: 0.9, weeklyLearningFrequency: 3.5,
  },
  buckets: [
    { localDay: "2026-07-18", contributingUsers: 5, insufficientSample: false, activeMs: 3600000 },
  ],
};

test("renders analytics coverage section", async () => {
  const adminStatistics = vi.fn().mockResolvedValue(mockAdminStats);
  render(<AdminAnalyticsPage adminStatistics={adminStatistics} />);
  expect(await screen.findByText("Analytics coverage")).toBeInTheDocument();
  expect(adminStatistics).toHaveBeenCalledWith("30d", "all");
});

test("shows opt-in coverage", async () => {
  const adminStatistics = vi.fn().mockResolvedValue(mockAdminStats);
  render(<AdminAnalyticsPage adminStatistics={adminStatistics} />);
  expect(await screen.findByText(/5 of 8 approved users opted in/)).toBeInTheDocument();
});

test("shows insufficient sample when < 5 contributors", async () => {
  const adminStatistics = vi.fn().mockResolvedValue({
    ...mockAdminStats,
    contributingUsers: 4,
    insufficientSample: true,
  });
  render(<AdminAnalyticsPage adminStatistics={adminStatistics} />);
  expect(await screen.findByText(/Insufficient sample/)).toBeInTheDocument();
  expect(screen.getByText(/4 contributors/)).toBeInTheDocument();
});

test("shows admin daily buckets in a graph without a personal heatmap", async () => {
  const adminStatistics = vi.fn().mockResolvedValue(mockAdminStats);
  render(<AdminAnalyticsPage adminStatistics={adminStatistics} />);
  expect(await screen.findByRole("button", { name: "Graph" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByRole("button", { name: "Heatmap" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("2026-07-18: 60 Active time")).toBeInTheDocument();
  expect(screen.queryByText("2000")).not.toBeInTheDocument();
});

test("does not expose app metrics below the privacy threshold", async () => {
  const adminStatistics = vi.fn().mockResolvedValue({
    ...mockAdminStats,
    reading: { contributingUsers: 4, insufficientSample: true },
  });
  render(<AdminAnalyticsPage adminStatistics={adminStatistics} />);
  expect(await screen.findByText("Reading sample too small")).toBeInTheDocument();
  expect(screen.queryByText("200")).not.toBeInTheDocument();
});

test("does not render any user email", async () => {
  const adminStatistics = vi.fn().mockResolvedValue(mockAdminStats);
  render(<AdminAnalyticsPage adminStatistics={adminStatistics} />);
  expect(screen.queryByText(/@example/)).not.toBeInTheDocument();
});
