import { afterEach, expect, test, vi } from "vitest";
import {
  deriveStatisticsPalette,
  loadStatisticsPreferences,
  saveStatisticsPreferences,
} from "./preferences";

const STORAGE_KEY = "library.statistics.preferences.v1";
const store: Record<string, string> = {};

const mockStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, val: string) => {
    store[key] = val;
  },
  removeItem: (key: string) => {
    delete store[key];
  },
  clear: () => {
    Object.keys(store).forEach((k) => delete store[k]);
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  Object.keys(store).forEach((k) => delete store[k]);
});

test("stores one normalized base color under a versioned key", () => {
  vi.stubGlobal("localStorage", mockStorage);
  saveStatisticsPreferences({ baseColor: "#3778D4", chartView: "graph" });
  expect(loadStatisticsPreferences()).toEqual({
    baseColor: "#3778d4",
    chartView: "graph",
  });
});

test("derives five ordered OKLCH color-mix expressions for dark theme", () => {
  expect(deriveStatisticsPalette("#3778d4", "dark")).toEqual([
    "color-mix(in oklch, #3778d4 28%, var(--surface-1))",
    "color-mix(in oklch, #3778d4 45%, var(--surface-1))",
    "color-mix(in oklch, #3778d4 62%, var(--surface-1))",
    "color-mix(in oklch, #3778d4 79%, var(--surface-1))",
    "color-mix(in oklch, #3778d4 96%, var(--surface-1))",
  ]);
});

test("derives five ordered OKLCH color-mix expressions for light theme", () => {
  expect(deriveStatisticsPalette("#3778d4", "light")).toEqual([
    "color-mix(in oklch, #3778d4 18%, var(--surface-1))",
    "color-mix(in oklch, #3778d4 36%, var(--surface-1))",
    "color-mix(in oklch, #3778d4 55%, var(--surface-1))",
    "color-mix(in oklch, #3778d4 76%, var(--surface-1))",
    "color-mix(in oklch, #3778d4 96%, var(--surface-1))",
  ]);
});

test("returns defaults when storage contains malformed JSON", () => {
  vi.stubGlobal("localStorage", {
    ...mockStorage,
    getItem: () => "not-json",
  });
  expect(loadStatisticsPreferences()).toEqual({
    baseColor: "#3778d4",
    chartView: "heatmap",
  });
});

test("returns defaults for invalid hex input", () => {
  vi.stubGlobal("localStorage", mockStorage);
  saveStatisticsPreferences({ baseColor: "invalid", chartView: "graph" });
  expect(loadStatisticsPreferences()).toEqual({
    baseColor: "#3778d4",
    chartView: "graph",
  });
});

test("normalizes white to near-gray", () => {
  vi.stubGlobal("localStorage", mockStorage);
  saveStatisticsPreferences({ baseColor: "#ffffff", chartView: "heatmap" });
  expect(loadStatisticsPreferences()).toEqual({
    baseColor: "#b8b8b8",
    chartView: "heatmap",
  });
});

test("normalizes black to near-dark", () => {
  vi.stubGlobal("localStorage", mockStorage);
  saveStatisticsPreferences({ baseColor: "#000000", chartView: "heatmap" });
  expect(loadStatisticsPreferences()).toEqual({
    baseColor: "#474747",
    chartView: "heatmap",
  });
});

test("caps over-saturated color at 90% saturation after round trip", () => {
  vi.stubGlobal("localStorage", mockStorage);
  saveStatisticsPreferences({ baseColor: "#ff0080", chartView: "heatmap" });
  const loaded = loadStatisticsPreferences();
  expect(loaded.baseColor).not.toBe("#ff0080");
});

test("#3778d4 passes through unchanged", () => {
  vi.stubGlobal("localStorage", mockStorage);
  saveStatisticsPreferences({ baseColor: "#3778d4", chartView: "heatmap" });
  expect(loadStatisticsPreferences()).toEqual({
    baseColor: "#3778d4",
    chartView: "heatmap",
  });
});

test("default return value is heatmap with blue base", () => {
  vi.stubGlobal("localStorage", mockStorage);
  expect(loadStatisticsPreferences()).toEqual({
    baseColor: "#3778d4",
    chartView: "heatmap",
  });
});

test("handles storage read errors gracefully", () => {
  vi.stubGlobal("localStorage", {
    ...mockStorage,
    getItem: () => {
      throw new Error("storage unavailable");
    },
  });
  expect(loadStatisticsPreferences()).toEqual({
    baseColor: "#3778d4",
    chartView: "heatmap",
  });
});

test("handles storage write errors gracefully", () => {
  vi.stubGlobal("localStorage", {
    ...mockStorage,
    setItem: () => {
      throw new Error("storage unavailable");
    },
  });
  expect(() =>
    saveStatisticsPreferences({ baseColor: "#3778d4", chartView: "graph" }),
  ).not.toThrow();
});
