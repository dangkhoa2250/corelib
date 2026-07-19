import { useCallback, useEffect, useState } from "react";
import type { StatisticsRange } from "../../../domain/statistics";
import type { AppStatisticsDetail, StatisticsAppDefinition } from "../registry";
import { ActivityChartCard } from "../components/ActivityChartCard";
import { formatMetric } from "../components/AppInsightCard";
import { KpiCard } from "../components/KpiCard";
import { MetricSection } from "../components/MetricSection";

interface RegisteredAppStatisticsPageProps {
  app: StatisticsAppDefinition;
  range: StatisticsRange;
}

export function RegisteredAppStatisticsPage({ app, range }: RegisteredAppStatisticsPageProps) {
  const [detail, setDetail] = useState<AppStatisticsDetail | null>(null);
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      setDetail(await app.loadDetail(range));
      setState("loaded");
    } catch {
      setDetail(null);
      setState("error");
    }
  }, [app, range]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="statistics-page">
      <MetricSection title="Overview" state={state} onRetry={load}>
        {detail && (
          <>
            <div className="statistics-kpi-grid">
              {detail.metrics.map((metric) => (
                <KpiCard key={metric.id} label={metric.label} value={formatMetric(metric.value, metric.unit)} />
              ))}
            </div>
            <ActivityChartCard range={range} totalBuckets={detail.buckets} series={[]} />
          </>
        )}
      </MetricSection>
    </div>
  );
}
