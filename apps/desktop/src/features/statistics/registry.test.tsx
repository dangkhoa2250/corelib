import { describe, expect, test, vi } from "vitest";
import { registerApp, getApp, getAllApps, clearApps } from "./registry";

describe("statisticsAppRegistry", () => {
  test("register and retrieve app", () => {
    clearApps();
    const FakeIcon = () => <svg />;
    registerApp({
      key: "test",
      title: "Test",
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
});
