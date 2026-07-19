import { useCallback, useEffect, useState } from "react";
import { IconCalendarStats, IconClock, IconFlame } from "@tabler/icons-react";
import type { ActiveDayBucket, StatisticsOverview, StatisticsPeriod } from "../../../domain/statistics";
import { getStatisticsOverview } from "../../../lib/statistics";
import { ActivityChartCard } from "../components/ActivityChartCard";
import { AppInsightCard } from "../components/AppInsightCard";
import { formatPeriodComparison, KpiCard } from "../components/KpiCard";
import { MetricSection } from "../components/MetricSection";
import type { AppStatisticsSummary, StatisticsAppDefinition } from "../registry";

interface StatisticsOverviewPageProps {
  period: StatisticsPeriod;
  onPeriodChange(period: StatisticsPeriod): void;
  getOverview?: typeof getStatisticsOverview;
  apps?: StatisticsAppDefinition[];
  onOpenApp?(appKey: string): void;
}

const NO_APPS: StatisticsAppDefinition[] = [];

function convertBuckets(
  buckets: { localDay: string; activeMs: number }[],
): { date: string; value: number }[] {
  return buckets.map((b) => ({
    date: b.localDay,
    value: Math.round(b.activeMs / 60000),
  }));
}

function formatMs(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function bucketTrend(buckets: { activeMs: number }[]): number[] {
  return buckets.map((bucket) => bucket.activeMs);
}

export function activeDayTrend(buckets: ActiveDayBucket[]): number[] {
  return buckets.map((bucket) => (bucket.isActiveDay ? 1 : 0));
}

export function StatisticsOverviewPage({
  period,
  getOverview = getStatisticsOverview,
  apps = NO_APPS,
  onOpenApp,
}: StatisticsOverviewPageProps) {
  const [data, setData] = useState<StatisticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appSummaries, setAppSummaries] = useState<Record<string, AppStatisticsSummary>>({});
  const [appErrors, setAppErrors] = useState<Set<string>>(new Set());
  const [appsLoading, setAppsLoading] = useState(apps.length > 0);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    setData(null);
    Promise.resolve(getOverview(period))
      .then(setData)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load statistics"),
      )
      .finally(() => setLoading(false));
  }, [period, getOverview]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    setAppsLoading(apps.length > 0);
    setAppSummaries({});
    setAppErrors(new Set());
    void Promise.allSettled(apps.map((app) => app.loadSummary(period))).then((results) => {
      if (cancelled) return;
      const summaries: Record<string, AppStatisticsSummary> = {};
      const failures = new Set<string>();
      results.forEach((result, index) => {
        const app = apps[index];
        if (result.status === "fulfilled") summaries[app.key] = result.value;
        else failures.add(app.key);
      });
      setAppSummaries(summaries);
      setAppErrors(failures);
      setAppsLoading(false);
    });
    return () => { cancelled = true; };
  }, [apps, period]);

  const handleRetry = useCallback(() => {
    load();
  }, [load]);

  return (
    <div>
      {loading && <MetricSection title="Overview" state="loading" />}
      {error && (
        <MetricSection
          title="Overview"
          state="error"
          errorMessage={error}
          onRetry={handleRetry}
        />
      )}
      {!data && !loading && !error && (
        <MetricSection title="Overview" state="empty" />
      )}

      {data && (
        <>
          <div className="statistics-kpi-grid">
            <KpiCard
              icon={<IconClock />}
              label="Active time"
              value={formatMs(data.activeMs)}
              comparison={formatPeriodComparison(data.activeMs, data.previousActiveMs, period.unit)}
              trend={bucketTrend(data.buckets)}
            />
            <KpiCard
              icon={<IconFlame />}
              label="Current streak"
              value={`${data.currentStreak} days`}
            />
            <KpiCard
              icon={<IconCalendarStats />}
              label="Active days"
              value={`${data.activeDays}`}
              comparison={formatPeriodComparison(data.activeDays, data.previousActiveDays, period.unit)}
              trend={activeDayTrend(data.activeDayBuckets)}
            />
          </div>

          <ActivityChartCard
            period={period}
            totalBuckets={convertBuckets(data.buckets)}
            timeBuckets={data.timeBuckets}
            series={apps.flatMap((app) => {
              const summary = appSummaries[app.key];
              return summary ? [{ appKey: app.key, title: app.title, buckets: summary.buckets }] : [];
            })}
          />

          {apps.length > 0 && (
            <section className="statistics-section" aria-labelledby="statistics-app-insights">
              <div className="statistics-section__header">
                <h2 id="statistics-app-insights" className="statistics-section__title">App insights</h2>
              </div>
              <div className="statistics-app-grid">
                {apps.map((app) => (
                  <AppInsightCard
                    key={app.key}
                    app={app}
                    summary={appSummaries[app.key] ?? null}
                    state={appsLoading ? "loading" : appErrors.has(app.key) ? "error" : "loaded"}
                    onOpen={onOpenApp ? () => onOpenApp(app.key) : undefined}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
