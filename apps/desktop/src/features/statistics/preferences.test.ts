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
};

afterEach(() => {
  vi.unstubAllGlobals();
  Object.keys(store).forEach((key) => delete store[key]);
});

test("persists only the chart view under the versioned key", () => {
  vi.stubGlobal("localStorage", mockStorage);

  saveStatisticsPreferences({ chartView: "graph" });

  expect(store[STORAGE_KEY]).toBe(JSON.stringify({ chartView: "graph" }));
  expect(loadStatisticsPreferences()).toEqual({ chartView: "graph" });
});

test("ignores a legacy base color while preserving the saved view", () => {
  vi.stubGlobal("localStorage", {
    ...mockStorage,
    getItem: () => JSON.stringify({ baseColor: "#3778d4", chartView: "graph" }),
  });

  expect(loadStatisticsPreferences()).toEqual({ chartView: "graph" });
});

test("returns a fresh fallback preference object for every load", () => {
  vi.stubGlobal("localStorage", mockStorage);

  const fallback = loadStatisticsPreferences();
  fallback.chartView = "graph";

  expect(loadStatisticsPreferences()).toEqual({ chartView: "heatmap" });
});

test("overwrites legacy preferences with chart-view-only data", () => {
  vi.stubGlobal("localStorage", mockStorage);
  store[STORAGE_KEY] = JSON.stringify({ baseColor: "#3778d4", chartView: "graph" });

  saveStatisticsPreferences({ chartView: "heatmap" });

  expect(store[STORAGE_KEY]).toBe(JSON.stringify({ chartView: "heatmap" }));
});

test.each([null, "not-json", JSON.stringify({}), JSON.stringify({ chartView: "radar" })])(
  "defaults malformed, missing, or invalid persisted values to heatmap",
  (value) => {
    vi.stubGlobal("localStorage", { ...mockStorage, getItem: () => value });

    expect(loadStatisticsPreferences()).toEqual({ chartView: "heatmap" });
  },
);

test("handles storage read and write errors without throwing", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("storage unavailable");
    },
    setItem: () => {
      throw new Error("storage unavailable");
    },
  });

  expect(loadStatisticsPreferences()).toEqual({ chartView: "heatmap" });
  expect(() => saveStatisticsPreferences({ chartView: "graph" })).not.toThrow();
});

test("derives five semantic warning color mixes for dark theme", () => {
  expect(deriveStatisticsPalette("dark")).toEqual([
    "color-mix(in oklch, var(--warning) 28%, var(--surface-1))",
    "color-mix(in oklch, var(--warning) 45%, var(--surface-1))",
    "color-mix(in oklch, var(--warning) 62%, var(--surface-1))",
    "color-mix(in oklch, var(--warning) 79%, var(--surface-1))",
    "color-mix(in oklch, var(--warning) 96%, var(--surface-1))",
  ]);
});

test("derives five semantic warning color mixes for light theme", () => {
  expect(deriveStatisticsPalette("light")).toEqual([
    "color-mix(in oklch, var(--warning) 18%, var(--surface-1))",
    "color-mix(in oklch, var(--warning) 36%, var(--surface-1))",
    "color-mix(in oklch, var(--warning) 55%, var(--surface-1))",
    "color-mix(in oklch, var(--warning) 76%, var(--surface-1))",
    "color-mix(in oklch, var(--warning) 96%, var(--surface-1))",
  ]);
});
