import { useCallback, useEffect, useState } from "react";
import type { ReadingStatistics, StatisticsPeriod } from "../../../domain/statistics";
import { getReadingStatistics } from "../../../lib/statistics";
import { ActivityChartCard } from "../components/ActivityChartCard";
import { StatisticsDetailSection } from "../components/StatisticsDetailSection";
import { StatisticsMetricStrip } from "../components/StatisticsMetricStrip";

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
  period: StatisticsPeriod;
  onPeriodChange?(period: StatisticsPeriod): void;
  getReadingStats?: typeof getReadingStatistics;
  onBack?: () => void;
}

export function ReadingStatisticsPage({
  period,
  getReadingStats = getReadingStatistics,
}: ReadingStatisticsPageProps) {
  const [stats, setStats] = useState<ReadingStatistics | null>(null);
  const [state, setState] = useState<"loading" | "error" | "loaded">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const retry = useCallback(() => setReloadKey((current) => current + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setStats(null);
    void getReadingStats(period)
      .then((result) => {
        if (!cancelled) {
          setStats(result);
          setState("loaded");
        }
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [period, getReadingStats, reloadKey]);

  return (
    <div className="statistics-page">
      <h1 className="statistics-detail-header">All Reading</h1>
      <StatisticsDetailSection
        title="Overview"
        state={state}
        onRetry={retry}
      >
        {stats && (
          <>
            <StatisticsMetricStrip
              ariaLabel="Reading summary"
              metrics={[
                { id: "active", label: "Active time", value: formatMs(stats.activeMs), emphasis: "primary" },
                { id: "sessions", label: "Sessions", value: String(stats.sessionCount), emphasis: "primary" },
                { id: "avg", label: "Average session", value: formatSessionTime(stats.averageSessionMs), emphasis: "primary" },
                { id: "visits", label: "Page visits", value: `${stats.pageVisits}`, emphasis: "secondary" },
                { id: "unique", label: "Unique pages", value: String(stats.uniquePages), emphasis: "secondary" },
                { id: "revisits", label: "Revisits", value: String(stats.revisits), emphasis: "secondary" },
              ]}
            />
            <ActivityChartCard
              embedded
              period={period}
              totalBuckets={stats.buckets.map((bucket) => ({ date: bucket.localDay, value: Math.round(bucket.activeMs / 60_000) }))}
              series={[]}
              timeBuckets={stats.timeBuckets}
            />
          </>
        )}
      </StatisticsDetailSection>
    </div>
  );
}
