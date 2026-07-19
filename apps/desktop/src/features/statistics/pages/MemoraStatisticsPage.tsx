import { useCallback, useEffect, useState } from "react";
import type { MemoraStatistics, StatisticsPeriod } from "../../../domain/statistics";
import { getMemoraStatistics } from "../../../lib/statistics";
import { KpiCard } from "../components/KpiCard";
import { MetricSection } from "../components/MetricSection";
import { ActivityChartCard } from "../components/ActivityChartCard";

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
  const load = useCallback(async () => {
    setState("loading");
    try {
      const result = await getMemoraStats(period);
      setStats(result);
      setState("loaded");
    } catch {
      setState("error");
    }
  }, [period, getMemoraStats]);

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
              <KpiCard label="Practice active time" value={formatMs(stats.practiceActiveMs)} />
              <KpiCard label="Sessions" value={`${stats.sessionCount} sessions`} />
              <KpiCard label="Reviews" value={`${stats.realReviews} reviews`} />
              <KpiCard label="Recall rate" value={formatRatio(stats.recallRate)} />
            </div>

            <MetricSection title="Ratings">
              <p className="statistics-hint">Again · Hard · Good · Easy</p>
              <KpiCard
                label="Rating distribution"
                value={`${stats.ratingDistribution.again} · ${stats.ratingDistribution.hard} · ${stats.ratingDistribution.good} · ${stats.ratingDistribution.easy}`}
              />
            </MetricSection>

            <MetricSection title="Card states">
              <div className="statistics-kpi-grid">
                <KpiCard label="New" value={String(stats.cardStates.new)} />
                <KpiCard label="Learning" value={String(stats.cardStates.learning)} />
                <KpiCard label="Review" value={String(stats.cardStates.review)} />
                <KpiCard label="Relearning" value={String(stats.cardStates.relearning)} />
                <KpiCard label="Suspended" value={String(stats.cardStates.suspended)} />
              </div>
            </MetricSection>

            <MetricSection title="Performance">
              <div className="statistics-kpi-grid">
                <KpiCard label="Average answer time" value={formatMsShort(stats.averageAnswerMs)} />
                <KpiCard label="Lapse rate" value={formatRatio(stats.lapseRate)} />
                <KpiCard label="Active days" value={String(stats.activeDays)} />
              </div>
            </MetricSection>

            <MetricSection title="Due forecast">
              <div className="statistics-kpi-grid">
                <KpiCard label="Today" value={String(stats.dueForecast.today)} />
                <KpiCard label="Next 7 days" value={String(stats.dueForecast.next7Days)} />
                <KpiCard label="Next 30 days" value={String(stats.dueForecast.next30Days)} />
              </div>
            </MetricSection>
            <ActivityChartCard period={period} totalBuckets={stats.buckets.map((bucket) => ({ date: bucket.localDay, value: Math.round(bucket.activeMs / 60_000) }))} series={[]} />
          </>
        )}
      </MetricSection>
    </div>
  );
}
