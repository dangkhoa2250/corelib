import { useCallback, useEffect, useState } from "react";
import type { DocumentStatistics, StatisticsRange } from "../../../domain/statistics";
import { getDocumentStatistics } from "../../../lib/statistics";
import { KpiCard } from "../components/KpiCard";
import { MetricSection } from "../components/MetricSection";
import { StatisticsShell } from "../components/StatisticsShell";

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

function formatRatio(value: number | null): string {
  if (value === null) return "\u2014";
  return `${Math.round(value * 100)}%`;
}

export interface DocumentStatisticsPageProps {
  documentId: string;
  range: StatisticsRange;
  onRangeChange(range: StatisticsRange): void;
  getDocStats?: typeof getDocumentStatistics;
  onBack?: () => void;
}

export function DocumentStatisticsPage({
  documentId,
  range,
  getDocStats = getDocumentStatistics,
  onBack,
}: DocumentStatisticsPageProps) {
  const [stats, setStats] = useState<DocumentStatistics | null>(null);
  const [state, setState] = useState<"loading" | "error" | "loaded">("loading");
  const load = useCallback(async () => {
    setState("loading");
    try {
      const result = await getDocStats(documentId, range);
      setStats(result);
      setState("loaded");
    } catch {
      setState("error");
    }
  }, [documentId, range, getDocStats]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <StatisticsShell title="Document" onBack={onBack}>
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

            <MetricSection title="Coverage">
              <div className="statistics-kpi-grid">
                <KpiCard label="Lifetime navigation coverage" value={`${Math.round(stats.coverage * 100)}% coverage`} />
              </div>
            </MetricSection>

            <MetricSection title="Reviews">
              <div className="statistics-kpi-grid">
                <KpiCard label="Real reviews" value={`${stats.realReviews} reviews`} />
                <KpiCard label="Recall rate" value={formatRatio(stats.recallRate)} />
                <KpiCard label="Again count" value={String(stats.againCount)} />
                <KpiCard label="Lapses" value={String(stats.lapses)} />
              </div>
            </MetricSection>
          </>
        )}
      </MetricSection>
    </StatisticsShell>
  );
}
