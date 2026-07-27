import { useCallback, useEffect, useState } from "react";
import type { MemoraStatistics, StatisticsPeriod } from "../../../domain/statistics";
import { getMemoraStatistics } from "../../../lib/statistics";
import { ActivityChartCard } from "../components/ActivityChartCard";
import { RatingDistribution } from "../components/RatingDistribution";
import { StatisticsDetailSection } from "../components/StatisticsDetailSection";
import { StatisticsMetricStrip } from "../components/StatisticsMetricStrip";

function formatMs(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatMsShort(ms: number | null): string {
  if (ms === null) return "\u2014";
  const seconds = Math.round(ms / 1000);
  return `${seconds}s`;
}

function formatRatio(value: number | null): string {
  if (value === null) return "\u2014";
  return `${Math.round(value * 100)}%`;
}

export interface MemoraStatisticsPageProps {
  period: StatisticsPeriod;
  onPeriodChange?(period: StatisticsPeriod): void;
  getMemoraStats?: typeof getMemoraStatistics;
  onBack?: () => void;
}

export function MemoraStatisticsPage({
  period,
  getMemoraStats = getMemoraStatistics,
}: MemoraStatisticsPageProps) {
  const [stats, setStats] = useState<MemoraStatistics | null>(null);
  const [state, setState] = useState<"loading" | "error" | "loaded">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const retry = useCallback(() => setReloadKey((current) => current + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setStats(null);
    void getMemoraStats(period)
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
  }, [period, getMemoraStats, reloadKey]);

  return (
    <div className="statistics-page">
      <h1 className="statistics-detail-header">All Memora</h1>
      <StatisticsDetailSection
        title="Overview"
        state={state}
        onRetry={retry}
      >
        {stats && (
          <>
            <StatisticsMetricStrip
              ariaLabel="Memora summary"
              metrics={[
                { id: "active", label: "Active time", value: formatMs(stats.activeMs), emphasis: "primary" },
                { id: "sessions", label: "Sessions", value: String(stats.sessionCount), emphasis: "primary" },
                { id: "reviews", label: "Reviews", value: String(stats.realReviews), emphasis: "primary" },
                { id: "recall", label: "Recall rate", value: formatRatio(stats.recallRate), emphasis: "primary" },
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
      {stats && (
        <>
          <StatisticsDetailSection title="Ratings">
            <RatingDistribution distribution={stats.ratingDistribution} />
          </StatisticsDetailSection>
          <StatisticsDetailSection title="Card states">
            <StatisticsMetricStrip
              ariaLabel="Card states"
              metrics={[
                { id: "new", label: "New", value: String(stats.cardStates.new) },
                { id: "learning", label: "Learning", value: String(stats.cardStates.learning) },
                { id: "review", label: "Review", value: String(stats.cardStates.review) },
                { id: "relearning", label: "Relearning", value: String(stats.cardStates.relearning) },
                { id: "suspended", label: "Suspended", value: String(stats.cardStates.suspended) },
              ]}
            />
          </StatisticsDetailSection>
          <StatisticsDetailSection title="Performance">
            <StatisticsMetricStrip
              ariaLabel="Performance"
              metrics={[
                { id: "practice", label: "Practice active time", value: formatMs(stats.practiceActiveMs), emphasis: "primary" },
                { id: "avg-answer", label: "Average answer time", value: formatMsShort(stats.averageAnswerMs) },
                { id: "lapse", label: "Lapse rate", value: formatRatio(stats.lapseRate) },
                { id: "active-days", label: "Active days", value: String(stats.activeDays) },
              ]}
            />
          </StatisticsDetailSection>
          <StatisticsDetailSection title="Due forecast">
            <StatisticsMetricStrip
              ariaLabel="Due forecast"
              metrics={[
                { id: "today", label: "Today", value: String(stats.dueForecast.today), emphasis: "primary" },
                { id: "next7", label: "Next 7 days", value: String(stats.dueForecast.next7Days), emphasis: "primary" },
                { id: "next30", label: "Next 30 days", value: String(stats.dueForecast.next30Days), emphasis: "primary" },
              ]}
            />
          </StatisticsDetailSection>
        </>
      )}
    </div>
  );
}
