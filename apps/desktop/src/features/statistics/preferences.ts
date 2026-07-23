const STORAGE_KEY = "library.statistics.preferences.v1";

const LIGHT_MIX = [18, 36, 55, 76, 96] as const;
const DARK_MIX = [28, 45, 62, 79, 96] as const;

export type StatisticsChartView = "heatmap" | "graph";

export interface StatisticsPreferences {
  chartView: StatisticsChartView;
}

const DEFAULT_PREFERENCES: StatisticsPreferences = { chartView: "heatmap" };

function isChartView(value: unknown): value is StatisticsChartView {
  return value === "heatmap" || value === "graph";
}

export function loadStatisticsPreferences(): StatisticsPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;

    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      isChartView((parsed as { chartView?: unknown }).chartView)
    ) {
      return { chartView: (parsed as { chartView: StatisticsChartView }).chartView };
    }
  } catch {
    // storage errors never break statistics
  }

  return DEFAULT_PREFERENCES;
}

export function saveStatisticsPreferences(value: StatisticsPreferences): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        chartView: isChartView(value.chartView) ? value.chartView : "heatmap",
      }),
    );
  } catch {
    // storage errors never break statistics
  }
}

export function deriveStatisticsPalette(theme: "light" | "dark"): string[] {
  const mix = theme === "light" ? LIGHT_MIX : DARK_MIX;
  return mix.map(
    (pct) => `color-mix(in oklch, var(--warning) ${pct}%, var(--surface-1))`,
  );
}
