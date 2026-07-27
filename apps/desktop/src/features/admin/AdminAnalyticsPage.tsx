import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import { IconChartBar } from "@tabler/icons-react";
import type { AdminAnalyticsRange, AdminStatistics, AdminStatisticsBucket } from "../../domain/account";
import { KpiCard as BaseKpiCard } from "../statistics/components/KpiCard";
import { MetricSection } from "../statistics/components/MetricSection";
import { AdminAnalyticsRangePicker } from "./AdminAnalyticsRangePicker";
import { StatisticsSkeleton } from "../statistics/components/StatisticsStates";
import { ActivityChartCard } from "../statistics/components/ActivityChartCard";
import { Combobox } from "../../components/Combobox";

const CACHE_KEY = "library.admin-statistics.cache.v1";

type KpiCardProps = Omit<ComponentProps<typeof BaseKpiCard>, "icon">;

function KpiCard(props: KpiCardProps) {
  return <BaseKpiCard icon={<IconChartBar />} {...props} />;
}

const appOptions = [
  { value: "all", label: "All apps" },
  { value: "reading", label: "Reading" },
  { value: "memora", label: "Memora" },
] as const;

interface CacheEntry {
  data: AdminStatistics;
  cachedAt: string;
  range: AdminAnalyticsRange;
  appKey: string;
}

function loadCache(range: AdminAnalyticsRange, appKey: string): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    return entry.range === range && entry.appKey === appKey ? entry : null;
  } catch {
    return null;
  }
}

function saveCache(data: AdminStatistics, range: AdminAnalyticsRange, appKey: string) {
  try {
    const entry: CacheEntry = { data, cachedAt: new Date().toISOString(), range, appKey };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
  }
}

export function clearAdminStatisticsCache(): void {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* cache cleanup is best effort */ }
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
  const [range, setRange] = useState<AdminAnalyticsRange>("30d");
  const [data, setData] = useState<AdminStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [appKey, setAppKey] = useState("all");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fn = adminStatisticsProp ?? (() => Promise.reject(new Error("No adminStatistics provider")));
      const result = await fn(range, appKey);
      setData(result);
      setCachedAt(null);
      saveCache(result, range, appKey);
    } catch (err: any) {
      const cached = loadCache(range, appKey);
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
  }, [range, appKey, adminStatisticsProp]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const insufficientSample = data && data.contributingUsers < 5;

  const buckets: { date: string; value: number }[] = useMemo(() => {
    if (!data) return [];
    return data.buckets.map((b: AdminStatisticsBucket) => ({
      date: b.localDay,
      value: Math.round((b.activeMs || 0) / 60_000),
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
        <AdminAnalyticsRangePicker range={range} onChange={setRange} />
        <Combobox
          value={appKey}
          onChange={setAppKey}
          options={[...appOptions]}
          ariaLabel="Admin statistics app"
          searchable={false}
          className="statistics-app-filter"
        />
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

          {data.reading?.insufficientSample && (
            <MetricSection title="Reading">
              <div className="statistics-card statistics-card--notice">Reading sample too small</div>
            </MetricSection>
          )}

          {data.reading && !data.reading.insufficientSample && data.reading.activeUsers != null && (
            <MetricSection title="Reading">
              <div className="statistics-kpi-grid">
                <KpiCard label="Active users" value={String(data.reading.activeUsers)} />
                <KpiCard label="Active time" value={formatMs(data.reading.activeMs ?? 0)} />
                <KpiCard label="Sessions" value={String(data.reading.sessionCount ?? 0)} />
                {data.reading.pageVisitCount != null && (
                  <KpiCard label="Page visits" value={String(data.reading.pageVisitCount)} />
                )}
                {data.reading.returningUserRate != null && (
                  <KpiCard label="Returning rate" value={formatPercent(data.reading.returningUserRate * 100)} />
                )}
              </div>
            </MetricSection>
          )}

          {data.memora?.insufficientSample && (
            <MetricSection title="Memora">
              <div className="statistics-card statistics-card--notice">Memora sample too small</div>
            </MetricSection>
          )}

          {data.memora && !data.memora.insufficientSample && data.memora.activeUsers != null && (
            <MetricSection title="Memora">
              <div className="statistics-kpi-grid">
                <KpiCard label="Active users" value={String(data.memora.activeUsers)} />
                <KpiCard label="Active time" value={formatMs(data.memora.activeMs ?? 0)} />
                <KpiCard label="Sessions" value={String(data.memora.sessionCount ?? 0)} />
                <KpiCard label="Reviews" value={String(data.memora.realReviewCount ?? 0)} />
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
            <ActivityChartCard
              heatmapEnabled={false}
              defaultGraphMode={range === "1y" || range === "all" ? "weekly" : "daily"}
              totalBuckets={buckets}
              series={[]}
            />
          )}
        </>
      )}
    </div>
  );
}
