import { useCallback, useEffect, useMemo, useState } from "react";
import { IconChartLine, IconLayoutGrid } from "@tabler/icons-react";
import type { StatisticsPeriod, StatisticsTimeBucket } from "../../../domain/statistics";
import {
  deriveStatisticsPalette,
  loadStatisticsPreferences,
  saveStatisticsPreferences,
} from "../preferences";
import type { ActivityChartSeries } from "../registry";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { ActivityGraph, type GraphMode } from "./ActivityGraph";
import { StatisticsColorPicker } from "./StatisticsColorPicker";
import { Combobox } from "../../../components/Combobox";

interface ActivityChartCardProps {
  period?: StatisticsPeriod;
  totalBuckets: { date: string; value: number }[];
  series: ActivityChartSeries[];
  timeBuckets?: StatisticsTimeBucket[];
  heatmapEnabled?: boolean;
  defaultGraphMode?: GraphMode;
}

export function periodDefaultGraphMode(period?: StatisticsPeriod): GraphMode {
  return period?.unit === "year" ? "weekly" : "daily";
}

export function ActivityChartCard({
  period,
  totalBuckets,
  series,
  timeBuckets,
  heatmapEnabled = true,
  defaultGraphMode,
}: ActivityChartCardProps) {
  const prefs = useMemo(() => loadStatisticsPreferences(), []);
  const canShowHeatmap = heatmapEnabled && timeBuckets !== undefined;

  const initialView = canShowHeatmap ? prefs.chartView : "graph";

  const [view, setView] = useState<"heatmap" | "graph">(initialView);
  const [graphMode, setGraphMode] = useState<GraphMode>(
    defaultGraphMode ?? periodDefaultGraphMode(period),
  );
  const [hasExplicitGraphMode, setHasExplicitGraphMode] = useState(false);
  const [selectedApp, setSelectedApp] = useState("all");
  const [baseColor, setBaseColor] = useState(prefs.baseColor);
  const [theme, setTheme] = useState<"light" | "dark">(
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );

  useEffect(() => {
    if (!hasExplicitGraphMode) {
      setGraphMode(defaultGraphMode ?? periodDefaultGraphMode(period));
    }
  }, [defaultGraphMode, hasExplicitGraphMode, period]);

  useEffect(() => {
    if (!canShowHeatmap) setView("graph");
  }, [canShowHeatmap]);

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setTheme(root.dataset.theme === "dark" ? "dark" : "light");
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    syncTheme();
    return () => observer.disconnect();
  }, []);

  const handleViewChange = useCallback(
    (newView: "heatmap" | "graph") => {
      setView(newView);
      saveStatisticsPreferences({
        ...loadStatisticsPreferences(),
        chartView: newView,
      });
    },
    [],
  );

  const handleColorChange = useCallback((color: string) => {
    setBaseColor(color);
    saveStatisticsPreferences({
      ...loadStatisticsPreferences(),
      baseColor: color,
    });
  }, []);

  const palette = useMemo(
    () => deriveStatisticsPalette(baseColor, theme),
    [baseColor, theme],
  );

  const appOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [
      { value: "all", label: "All apps" },
    ];
    for (const s of series) {
      opts.push({ value: s.appKey, label: s.title });
    }
    return opts;
  }, [series]);

  const filteredData = useMemo(() => {
    if (selectedApp === "all") {
      return totalBuckets;
    }
    const appSeries = series.find((s) => s.appKey === selectedApp);
    return appSeries?.buckets ?? [];
  }, [selectedApp, totalBuckets, series]);

  const handleGraphModeChange = useCallback((mode: GraphMode) => {
    setHasExplicitGraphMode(true);
    setGraphMode(mode);
  }, []);

  return (
    <section className="statistics-section">
      <div className="statistics-section__header">
        <h2 className="statistics-section__title">Activity</h2>
        <div className="statistics-chart-card__toggle">
          {canShowHeatmap ? (
            <>
              <button
                type="button"
                className="statistics-control"
                aria-pressed={view === "heatmap"}
                onClick={() => handleViewChange("heatmap")}
              >
                <IconLayoutGrid aria-hidden="true" size={16} />
                <span>Heatmap</span>
              </button>
              <button
                type="button"
                className="statistics-control"
                aria-pressed={view === "graph"}
                onClick={() => handleViewChange("graph")}
              >
                <IconChartLine aria-hidden="true" size={16} />
                <span>Graph</span>
              </button>
            </>
          ) : (
            <button type="button" className="statistics-control" aria-pressed="true">
              <IconChartLine aria-hidden="true" size={16} />
              <span>Graph</span>
            </button>
          )}
        </div>
      </div>
      <div className="statistics-chart-card__controls">
        <Combobox
          value={selectedApp}
          onChange={setSelectedApp}
          options={appOptions}
          ariaLabel="Statistics app"
          searchable={false}
          className="statistics-app-filter"
        />
      </div>
      {canShowHeatmap && view === "heatmap" && period && (
        <ActivityHeatmap
          period={period}
          buckets={timeBuckets ?? []}
          selectedApp={selectedApp}
          palette={palette}
        />
      )}
      {view === "graph" && (
        <ActivityGraph
          buckets={filteredData}
          mode={graphMode}
          onModeChange={handleGraphModeChange}
          valueLabel="Active time"
          palette={palette}
        />
      )}
      <StatisticsColorPicker
        baseColor={baseColor}
        onChange={handleColorChange}
      />
    </section>
  );
}
