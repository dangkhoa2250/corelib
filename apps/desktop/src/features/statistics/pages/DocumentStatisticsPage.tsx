import { useCallback, useEffect, useState } from "react";
import type { DocumentStatistics, StatisticsPeriod } from "../../../domain/statistics";
import type { LibraryDocument } from "../../../domain/document";
import { documentStatusLabel } from "../../../domain/document";
import { getDocumentStatistics } from "../../../lib/statistics";
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

function formatRatio(value: number | null): string {
  if (value === null) return "\u2014";
  return `${Math.round(value * 100)}%`;
}

export interface DocumentStatisticsPageProps {
  document: LibraryDocument;
  period: StatisticsPeriod;
  onPeriodChange?(period: StatisticsPeriod): void;
  getDocStats?: typeof getDocumentStatistics;
  onBack?: () => void;
}

export function DocumentStatisticsPage({
  document,
  period,
  getDocStats = getDocumentStatistics,
}: DocumentStatisticsPageProps) {
  const [stats, setStats] = useState<DocumentStatistics | null>(null);
  const [state, setState] = useState<"loading" | "error" | "loaded">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const retry = useCallback(() => setReloadKey((current) => current + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setStats(null);
    void getDocStats(document.id, period)
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
  }, [document.id, period, getDocStats, reloadKey]);

  const statusLabel = documentStatusLabel(document);

  return (
    <div className="statistics-page">
      <h1 className="statistics-detail-header">{document.title}</h1>
      {document.author ? (
        <p className="statistics-detail-subheader">{document.author}</p>
      ) : null}
      {statusLabel ? (
        <p className="statistics-detail-status">{statusLabel}</p>
      ) : null}
      <StatisticsDetailSection
        title="Reading"
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
      {stats && (
        <>
          <StatisticsDetailSection title="Coverage">
            <StatisticsMetricStrip
              ariaLabel="Coverage summary"
              metrics={[
                { id: "coverage", label: "Lifetime navigation coverage", value: `${Math.round(stats.coverage * 100)}%`, emphasis: "primary" },
              ]}
            />
          </StatisticsDetailSection>
          <StatisticsDetailSection title="Reviews">
            <StatisticsMetricStrip
              ariaLabel="Review summary"
              metrics={[
                { id: "real", label: "Real reviews", value: String(stats.realReviews), emphasis: "primary" },
                { id: "recall", label: "Recall rate", value: formatRatio(stats.recallRate), emphasis: "primary" },
                { id: "again", label: "Again count", value: String(stats.againCount), emphasis: "secondary" },
                { id: "lapses", label: "Lapses", value: String(stats.lapses), emphasis: "secondary" },
              ]}
            />
          </StatisticsDetailSection>
        </>
      )}
    </div>
  );
}
