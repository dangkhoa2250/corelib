import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminStatistics, AdminStatisticsBucket } from "../../domain/account";
import type { StatisticsRange } from "../../domain/statistics";
import { KpiCard } from "../statistics/components/KpiCard";
import { MetricSection } from "../statistics/components/MetricSection";
import { StatisticsRangePicker } from "../statistics/components/StatisticsRangePicker";
import { StatisticsSkeleton } from "../statistics/components/StatisticsStates";

const CACHE_KEY = "library.admin-statistics.cache.v1";

interface CacheEntry {
  data: AdminStatistics;
  cachedAt: string;
}

function loadCache(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

function saveCache(data: AdminStatistics) {
  try {
    const entry: CacheEntry = { data, cachedAt: new Date().toISOString() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
  }
}

interface AdminAnalyticsPageProps {
  adminStatistics?: (range: string, appKey: string) => Promise<AdminStatistics>;
}

function formatMs(ms: number): string {
  if (ms >= 3600000) {
    const hours = ms / 3600000;
    return `${hours.toFixed(1)}h`;
  }
  const minutes = ms / 60000;
  return `${minutes.toFixed(0)}m`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function AdminAnalyticsPage({
  adminStatistics: adminStatisticsProp,
}: AdminAnalyticsPageProps) {
  const [range, setRange] = useState<StatisticsRange>("30d");
  const [data, setData] = useState<AdminStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [chartView, setChartView] = useState<"heatmap" | "graph">("heatmap");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fn = adminStatisticsProp ?? (() => Promise.reject(new Error("No adminStatistics provider")));
      const result = await fn(range, "");
      setData(result);
      setCachedAt(null);
      saveCache(result);
    } catch (err: any) {
      const cached = loadCache();
      if (cached) {
        setData(cached.data);
        setCachedAt(cached.cachedAt);
        setError(null);
      } else {
        setError(err?.message || "Failed to load analytics");
      }
    } finally {
      setLoading(false);
    }
  }, [range, adminStatisticsProp]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const insufficientSample = data && data.contributingUsers < 5;

  const buckets: { date: string; value: number }[] = useMemo(() => {
    if (!data) return [];
    return data.buckets.map((b: AdminStatisticsBucket) => ({
      date: b.localDay,
      value: b.activeMs || 0,
    }));
  }, [data]);

  const formatCachedTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <div className="statistics-shell__content" style={{ padding: "28px 20px 40px 28px" }}>
      <div className="statistics-range-picker" style={{ marginBottom: 24 }}>
        <StatisticsRangePicker range={range} onChange={setRange} />
      </div>

      {cachedAt && (
        <div className="statistics-muted" style={{ marginBottom: 16, fontSize: 13 }}>
          Cached data from {formatCachedTime(cachedAt)}
        </div>
      )}

      {loading && !data && <StatisticsSkeleton />}

      {error && !data && (
        <MetricSection title="Analytics" state="error" errorMessage={error} onRetry={loadData} />
      )}

      {data && (
        <>
          <MetricSection title="Analytics coverage">
            {insufficientSample ? (
              <div className="statistics-card" style={{ padding: 16, marginBottom: 16 }}>
                <span className="statistics-card__label">Insufficient sample</span>
                <p className="statistics-muted" style={{ margin: "8px 0 0" }}>
                  {data.contributingUsers} contributors — fewer than 5 in the selected range
                </p>
              </div>
            ) : (
              <div className="statistics-card" style={{ padding: 16, marginBottom: 16 }}>
                <span className="statistics-card__label">
                  {data.analyticsEnabledUsers} of {data.approvedUsers} approved users opted in
                </span>
                <div className="statistics-card__value">
                  {formatPercent(data.optInPercentage)}
                </div>
                <p className="statistics-muted" style={{ margin: "8px 0 0" }}>
                  {data.contributingUsers} contributors
                </p>
              </div>
            )}
          </MetricSection>

          {data.dau !== undefined && (
            <MetricSection title="Active users">
              <div className="statistics-kpi-grid">
                <KpiCard label="DAU" value={String(data.dau)} />
                <KpiCard label="WAU" value={String(data.wau)} />
                <KpiCard label="MAU" value={String(data.mau)} />
              </div>
            </MetricSection>
          )}

          {data.activeMs !== undefined && (
            <MetricSection title="Activity">
              <div className="statistics-kpi-grid">
                <KpiCard label="Active time" value={formatMs(data.activeMs || 0)} />
                <KpiCard label="Active days" value={String(data.activeDays)} />
                {data.averageActiveMs != null && (
                  <KpiCard label="Avg daily active time" value={formatMs(data.averageActiveMs)} />
                )}
                {data.averageActiveDays != null && (
                  <KpiCard label="Avg active days per user" value={String(data.averageActiveDays)} />
                )}
              </div>
            </MetricSection>
          )}

          {data.appAllocation && (
            <MetricSection title="App allocation">
              <div className="statistics-kpi-grid">
                {Object.entries(data.appAllocation).map(([app, share]) => (
                  <KpiCard key={app} label={app} value={formatPercent(share)} />
                ))}
              </div>
            </MetricSection>
          )}

          {data.reading && (
            <MetricSection title="Reading">
              <div className="statistics-kpi-grid">
                <KpiCard label="Active users" value={String(data.reading.activeUsers)} />
                <KpiCard label="Active time" value={formatMs(data.reading.activeMs)} />
                <KpiCard label="Sessions" value={String(data.reading.sessionCount)} />
                {data.reading.pageVisitCount != null && (
                  <KpiCard label="Page visits" value={String(data.reading.pageVisitCount)} />
                )}
                {data.reading.returningUserRate != null && (
                  <KpiCard label="Returning rate" value={formatPercent(data.reading.returningUserRate * 100)} />
                )}
              </div>
            </MetricSection>
          )}

          {data.memora && (
            <MetricSection title="Memora">
              <div className="statistics-kpi-grid">
                <KpiCard label="Active users" value={String(data.memora.activeUsers)} />
                <KpiCard label="Active time" value={formatMs(data.memora.activeMs)} />
                <KpiCard label="Sessions" value={String(data.memora.sessionCount)} />
                <KpiCard label="Reviews" value={String(data.memora.realReviewCount)} />
                {data.memora.recallRate != null && (
                  <KpiCard label="Recall rate" value={formatPercent(data.memora.recallRate * 100)} />
                )}
                {data.memora.weeklyLearningFrequency != null && (
                  <KpiCard label="Weekly frequency" value={String(data.memora.weeklyLearningFrequency)} />
                )}
              </div>
            </MetricSection>
          )}

          {buckets.length > 0 && (
            <MetricSection title="Activity chart">
              <div className="statistics-chart-card__toggle" style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  className="statistics-control"
                  aria-pressed={chartView === "heatmap"}
                  onClick={() => setChartView("heatmap")}
                >
                  Heatmap
                </button>
                <button
                  type="button"
                  className="statistics-control"
                  aria-pressed={chartView === "graph"}
                  onClick={() => setChartView("graph")}
                >
                  Graph
                </button>
              </div>
              {chartView === "heatmap" ? (
                <div className="statistics-muted" style={{ padding: 16 }}>
                  {buckets.length} days of data
                </div>
              ) : (
                <div className="statistics-muted" style={{ padding: 16 }}>
                  {buckets.map((b) => (
                    <div key={b.date}>
                      {b.date}: {formatMs(b.value)}
                    </div>
                  ))}
                </div>
              )}
            </MetricSection>
          )}
        </>
      )}
    </div>
  );
}
