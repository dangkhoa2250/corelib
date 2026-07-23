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

test("derives five blue accent color mixes for dark theme", () => {
  const palette = deriveStatisticsPalette("dark");
  expect(palette).toEqual([
    "color-mix(in srgb, var(--statistics-accent) 28%, var(--surface-1))",
    "color-mix(in srgb, var(--statistics-accent) 45%, var(--surface-1))",
    "color-mix(in srgb, var(--statistics-accent) 62%, var(--surface-1))",
    "color-mix(in srgb, var(--statistics-accent) 79%, var(--surface-1))",
    "color-mix(in srgb, var(--statistics-accent) 100%, var(--surface-1))",
  ]);
  expect(palette.some((color) => color.includes("in oklch"))).toBe(false);
  expect(palette.some((color) => color.includes("var(--warning)"))).toBe(false);
});

test("derives five blue accent color mixes for light theme", () => {
  const palette = deriveStatisticsPalette("light");
  expect(palette).toEqual([
    "color-mix(in srgb, var(--statistics-accent) 18%, var(--surface-1))",
    "color-mix(in srgb, var(--statistics-accent) 36%, var(--surface-1))",
    "color-mix(in srgb, var(--statistics-accent) 55%, var(--surface-1))",
    "color-mix(in srgb, var(--statistics-accent) 76%, var(--surface-1))",
    "color-mix(in srgb, var(--statistics-accent) 100%, var(--surface-1))",
  ]);
  expect(palette.some((color) => color.includes("in oklch"))).toBe(false);
  expect(palette.some((color) => color.includes("var(--warning)"))).toBe(false);
});
