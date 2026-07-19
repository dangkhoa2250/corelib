import type { AppStatisticsSummary, StatisticsAppDefinition } from "../registry";
import { IconChevronRight } from "@tabler/icons-react";
import { MiniSparkline } from "./MiniSparkline";

interface AppInsightCardProps {
  app: StatisticsAppDefinition;
  summary: AppStatisticsSummary | null;
  state: "loading" | "loaded" | "error";
  onOpen?(): void;
}

export function formatMetric(value: number | null, unit: "milliseconds" | "count" | "ratio"): string {
  if (value === null) return "—";
  if (unit === "ratio") return `${Math.round(value * 100)}%`;
  if (unit === "count") return new Intl.NumberFormat().format(value);
  const hours = Math.floor(value / 3_600_000);
  const minutes = Math.floor((value % 3_600_000) / 60_000);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function AppInsightCard({ app, summary, state, onOpen }: AppInsightCardProps) {
  const Icon = app.icon;
  return (
    <article className="statistics-app-card" aria-label={`${app.title} statistics`}>
      <div className="statistics-app-card__heading">
        <span className="statistics-app-card__icon"><Icon /></span>
        <div>
          <h3>{app.title}</h3>
          <p>{app.tagline}</p>
        </div>
      </div>
      {state === "loading" && <p className="statistics-muted">Loading…</p>}
      {state === "error" && <p className="statistics-muted">Statistics unavailable</p>}
      {state === "loaded" && summary && (
        <>
          <div className="statistics-app-card__metrics">
            <div><strong>{formatMetric(summary.primary.value, summary.primary.unit)}</strong><span>{summary.primary.label}</span></div>
            <div><strong>{formatMetric(summary.secondary.value, summary.secondary.unit)}</strong><span>{summary.secondary.label}</span></div>
          </div>
          <MiniSparkline label={`${app.title} trend`} points={summary.buckets.map((bucket) => bucket.value)} />
        </>
      )}
      {state === "loaded" && !summary && <p className="statistics-muted">No activity in this period</p>}
      {onOpen && (
        <button
          className="statistics-app-card__open"
          type="button"
          onClick={onOpen}
          aria-label={`Open ${app.title} statistics`}
          title={`Open ${app.title} statistics`}
        >
          <IconChevronRight aria-hidden="true" />
        </button>
      )}
    </article>
  );
}
