import { expect, it, vi } from "vitest";
import { registerAccount, loadAccountSession } from "./account";
import { hasFeature, type DailyStatisticsSnapshot, type AdminStatistics } from "../domain/account";

it("sends a registration request through the typed native command", async () => {
  const call = vi.fn().mockResolvedValue({ status: "pending" });
  await registerAccount({ displayName: "Mai", email: "mai@example.test", password: "password-123" }, call);
  expect(call).toHaveBeenCalledWith("account_register", { displayName: "Mai", email: "mai@example.test", password: "password-123" });
});

it("loads the session through account_session", async () => {
  const call = vi.fn().mockResolvedValue({ profile: null, entitlements: null });
  await loadAccountSession(call);
  expect(call).toHaveBeenCalledWith("account_session");
});

it("upserts daily statistics through the typed native command", async () => {
  const call = vi.fn().mockResolvedValue(undefined);
  const { PocketBaseAccountApiClient } = await import("./account");
  const client = new PocketBaseAccountApiClient(call);

  const input: DailyStatisticsSnapshot = {
    schemaVersion: 1,
    localDay: "2026-07-19",
    appKey: "reading",
    activeMs: 3600000,
    activeDay: true,
    sessionCount: 3,
  };

  await client.upsertDailyStatistics(input);
  expect(call).toHaveBeenCalledWith("account_upsert_daily_statistics", { input });
});

it("retrieves admin statistics through the typed native command", async () => {
  const mockStats: AdminStatistics = {
    approvedUsers: 10,
    analyticsEnabledUsers: 8,
    optInPercentage: 80,
    contributingUsers: 5,
    insufficientSample: false,
    buckets: [],
  };
  const call = vi.fn().mockResolvedValue(mockStats);
  const { PocketBaseAccountApiClient } = await import("./account");
  const client = new PocketBaseAccountApiClient(call);

  const result = await client.adminStatistics("7d", "reading");
  expect(call).toHaveBeenCalledWith("admin_get_statistics", { range: "7d", appKey: "reading" });
  expect(result).toEqual(mockStats);
});

it("hasFeature checks entitlements correctly", () => {
  expect(hasFeature(null, "beta_reader")).toBe(false);
  expect(hasFeature(undefined, "beta_reader")).toBe(false);
  expect(hasFeature({ featureKeys: [], refreshedAt: "" }, "beta_reader")).toBe(false);
  expect(hasFeature({ featureKeys: ["beta_reader"], refreshedAt: "" }, "beta_reader")).toBe(true);
});
