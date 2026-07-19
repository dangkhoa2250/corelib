import type { AppStatisticsSummary, StatisticsAppDefinition } from "../registry";

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
    <button className="statistics-app-card" type="button" onClick={onOpen} disabled={!onOpen}>
      <span className="statistics-app-card__heading">
        <span className="statistics-app-card__icon"><Icon /></span>
        <span>{app.title}</span>
      </span>
      {state === "loading" && <span className="statistics-muted">Loading…</span>}
      {state === "error" && <span className="statistics-muted">Statistics unavailable</span>}
      {state === "loaded" && summary && (
        <span className="statistics-app-card__metrics">
          <span><strong>{formatMetric(summary.primary.value, summary.primary.unit)}</strong> {summary.primary.label}</span>
          <span><strong>{formatMetric(summary.secondary.value, summary.secondary.unit)}</strong> {summary.secondary.label}</span>
        </span>
      )}
    </button>
  );
}
