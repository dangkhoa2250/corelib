import { useCallback, useEffect, useState } from "react";
import type { DeckStatisticsDetail, StatisticsRange } from "../../../domain/statistics";
import { getDeckStatisticsDetail } from "../../../lib/statistics";
import { KpiCard } from "../components/KpiCard";
import { MetricSection } from "../components/MetricSection";
import { StatisticsShell } from "../components/StatisticsShell";

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

export interface DeckStatisticsPageProps {
  deckId: string;
  range: StatisticsRange;
  onRangeChange(range: StatisticsRange): void;
  getDeckStats?: typeof getDeckStatisticsDetail;
  onBack?: () => void;
}

export function DeckStatisticsPage({
  deckId,
  range,
  onRangeChange,
  getDeckStats = getDeckStatisticsDetail,
  onBack,
}: DeckStatisticsPageProps) {
  const [stats, setStats] = useState<DeckStatisticsDetail | null>(null);
  const [state, setState] = useState<"loading" | "error" | "loaded">("loading");
  const load = useCallback(async () => {
    setState("loading");
    try {
      const result = await getDeckStats(deckId, range);
      setStats(result);
      setState("loaded");
    } catch {
      setState("error");
    }
  }, [deckId, range, getDeckStats]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <StatisticsShell title="Deck" onBack={onBack}>
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
              </div>
            </MetricSection>

            <MetricSection title="Due forecast">
              <div className="statistics-kpi-grid">
                <KpiCard label="Today" value={String(stats.dueForecast.today)} />
                <KpiCard label="Next 7 days" value={String(stats.dueForecast.next7Days)} />
                <KpiCard label="Next 30 days" value={String(stats.dueForecast.next30Days)} />
              </div>
            </MetricSection>
          </>
        )}
      </MetricSection>
    </StatisticsShell>
  );
}
