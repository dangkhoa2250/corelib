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
  appOptions?: ActivityChartAppOption[];
  timeBuckets?: StatisticsTimeBucket[];
  heatmapEnabled?: boolean;
  defaultGraphMode?: GraphMode;
}

/** Apps registered for this statistics surface, independent of loaded data. */
export interface ActivityChartAppOption {
  appKey: string;
  title: string;
}

export function periodDefaultGraphMode(period?: StatisticsPeriod): GraphMode {
  return period?.unit === "year" ? "weekly" : "daily";
}

export function graphModesForPeriod(period?: StatisticsPeriod): GraphMode[] {
  if (period?.unit === "week") {
    return ["daily", "cumulative"];
  }
  return ["daily", "weekly", "cumulative"];
}

/**
 * Produces the selected app's daily graph series from the same hourly source
 * as the heatmap. The authoritative all-apps daily series remains separate.
 */
export function dailyBucketsFromTimeBuckets(
  calendarDays: { date: string; value: number }[],
  buckets: StatisticsTimeBucket[],
): { date: string; value: number }[] {
  const activeMsByDay = new Map<string, number>();
  for (const bucket of buckets) {
    if (bucket.isFuture) continue;
    activeMsByDay.set(
      bucket.localDay,
      (activeMsByDay.get(bucket.localDay) ?? 0) + bucket.activeMs,
    );
  }
  return calendarDays.map(({ date }) => ({
    date,
    value: Math.round((activeMsByDay.get(date) ?? 0) / 60_000),
  }));
}

export function ActivityChartCard({
  period,
  totalBuckets,
  series,
  appOptions: registeredApps,
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

  const allowedGraphModes = useMemo(
    () => graphModesForPeriod(period),
    [period?.unit],
  );
  const defaultAllowedGraphMode = useMemo(() => {
    const preferred = defaultGraphMode ?? periodDefaultGraphMode(period);
    return allowedGraphModes.includes(preferred)
      ? preferred
      : periodDefaultGraphMode(period);
  }, [allowedGraphModes, defaultGraphMode, period]);
  const displayedGraphMode =
    hasExplicitGraphMode && allowedGraphModes.includes(graphMode)
      ? graphMode
      : defaultAllowedGraphMode;

  useEffect(() => {
    if (!hasExplicitGraphMode || !allowedGraphModes.includes(graphMode)) {
      setGraphMode(defaultAllowedGraphMode);
      if (hasExplicitGraphMode) {
        setHasExplicitGraphMode(false);
      }
    }
  }, [
    allowedGraphModes,
    defaultAllowedGraphMode,
    graphMode,
    hasExplicitGraphMode,
  ]);

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
    for (const app of registeredApps ?? series) {
      opts.push({ value: app.appKey, label: app.title });
    }
    return opts;
  }, [registeredApps, series]);

  const selectedData = useMemo(() => {
    if (selectedApp === "all") {
      return {
        dailyBuckets: totalBuckets,
        timeBuckets: timeBuckets ?? [],
      };
    }
    const appSeries = series.find((s) => s.appKey === selectedApp);
    const selectedTimeBuckets = (timeBuckets ?? []).filter((bucket) => bucket.appKey === selectedApp);
    return {
      dailyBuckets: timeBuckets === undefined
        ? appSeries?.buckets ?? []
        : dailyBucketsFromTimeBuckets(totalBuckets, selectedTimeBuckets),
      timeBuckets: selectedTimeBuckets,
    };
  }, [selectedApp, series, timeBuckets, totalBuckets]);

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
          buckets={selectedData.timeBuckets}
          selectedApp="all"
          palette={palette}
        />
      )}
      {view === "graph" && (
        <ActivityGraph
          buckets={selectedData.dailyBuckets}
          mode={displayedGraphMode}
          onModeChange={handleGraphModeChange}
          valueLabel="Active time"
          palette={palette}
          allowedModes={allowedGraphModes}
        />
      )}
      <StatisticsColorPicker
        baseColor={baseColor}
        onChange={handleColorChange}
      />
    </section>
  );
}
