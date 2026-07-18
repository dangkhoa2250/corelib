import { useCallback, useEffect, useState } from "react";
import type { StatisticsOverview, StatisticsRange } from "../../../domain/statistics";
import { getStatisticsOverview } from "../../../lib/statistics";
import { ActivityChartCard } from "../components/ActivityChartCard";
import { KpiCard } from "../components/KpiCard";
import { MetricSection } from "../components/MetricSection";
import { StatisticsRangePicker } from "../components/StatisticsRangePicker";

interface StatisticsOverviewPageProps {
  range: StatisticsRange;
  onRangeChange(range: StatisticsRange): void;
  getOverview?: typeof getStatisticsOverview;
}

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

export function StatisticsOverviewPage({
  range,
  onRangeChange,
  getOverview = getStatisticsOverview,
}: StatisticsOverviewPageProps) {
  const [data, setData] = useState<StatisticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    setData(null);
    Promise.resolve(getOverview(range))
      .then(setData)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load statistics"),
      )
      .finally(() => setLoading(false));
  }, [range, getOverview]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRetry = useCallback(() => {
    load();
  }, [load]);

  return (
    <div>
      <StatisticsRangePicker range={range} onChange={onRangeChange} />

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
            <KpiCard label="Active time" value={formatMs(data.activeMs)} />
            <KpiCard label="Current streak" value={`${data.currentStreak} days`} />
            <KpiCard label="Active days" value={`${data.activeDays}`} />
          </div>

          <ActivityChartCard
            range={range}
            totalBuckets={convertBuckets(data.buckets)}
            series={[]}
          />
        </>
      )}
    </div>
  );
}
