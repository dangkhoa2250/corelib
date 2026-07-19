import { useCallback, useEffect, useState } from "react";
import type { ReadingStatistics, StatisticsRange } from "../../../domain/statistics";
import { getReadingStatistics } from "../../../lib/statistics";
import { KpiCard } from "../components/KpiCard";
import { MetricSection } from "../components/MetricSection";
import { ActivityChartCard } from "../components/ActivityChartCard";

function formatMs(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatSessionTime(ms: number | null): string {
  if (ms === null) return "\u2014";
  return formatMs(ms);
}

export interface ReadingStatisticsPageProps {
  range: StatisticsRange;
  onRangeChange(range: StatisticsRange): void;
  getReadingStats?: typeof getReadingStatistics;
  onBack?: () => void;
}

export function ReadingStatisticsPage({
  range,
  getReadingStats = getReadingStatistics,
}: ReadingStatisticsPageProps) {
  const [stats, setStats] = useState<ReadingStatistics | null>(null);
  const [state, setState] = useState<"loading" | "error" | "loaded">("loading");
  const load = useCallback(async () => {
    setState("loading");
    try {
      const result = await getReadingStats(range);
      setStats(result);
      setState("loaded");
    } catch {
      setState("error");
    }
  }, [range, getReadingStats]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="statistics-page">
      <MetricSection
        title="Overview"
        state={state}
        onRetry={load}
      >
        {stats && (
          <>
            <div className="statistics-kpi-grid">
              <KpiCard label="Active time" value={formatMs(stats.activeMs)} />
              <KpiCard label="Sessions" value={`${stats.sessionCount} sessions`} />
              <KpiCard label="Average session" value={formatSessionTime(stats.averageSessionMs)} />
              <KpiCard label="Page visits" value={`${stats.pageVisits} visits`} />
              <KpiCard label="Unique pages" value={String(stats.uniquePages)} />
              <KpiCard label="Revisits" value={String(stats.revisits)} />
            </div>
            <ActivityChartCard range={range} totalBuckets={stats.buckets.map((bucket) => ({ date: bucket.localDay, value: Math.round(bucket.activeMs / 60_000) }))} series={[]} />
          </>
        )}
      </MetricSection>
    </div>
  );
}
