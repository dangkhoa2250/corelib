import type { ReactNode } from "react";
import type { StatisticsPeriodUnit } from "../../../domain/statistics";
import { MiniSparkline } from "./MiniSparkline";

export interface KpiComparison {
  kind: "increase" | "decrease" | "neutral";
  label: string;
}

interface KpiCardProps {
  icon?: ReactNode;
  label: string;
  value: string;
  help?: string;
  comparison?: KpiComparison;
  trend?: number[];
}

export function formatPeriodComparison(
  current: number,
  previous: number,
  unit: StatisticsPeriodUnit,
): KpiComparison {
  if (current === 0 && previous === 0) {
    return { kind: "neutral", label: "No change" };
  }

  if (previous === 0 && current > 0) {
    return { kind: "increase", label: "New activity" };
  }

  const change = ((current - previous) / previous) * 100;
  const kind = change > 0 ? "increase" : change < 0 ? "decrease" : "neutral";
  if (kind === "neutral") return { kind, label: "No change" };

  const direction = kind === "increase" ? "↑" : "↓";
  const periodName = `${unit === "week" ? "week" : unit === "month" ? "month" : "year"}`;
  return {
    kind,
    label: `${direction} ${Math.round(Math.abs(change))}% vs previous ${periodName}`,
  };
}

export function KpiCard({ icon, label, value, help, comparison, trend }: KpiCardProps) {
  return (
    <div className="statistics-card statistics-kpi-card">
      <div className="statistics-kpi-card__header">
        {icon && <span className="statistics-kpi-card__icon" aria-hidden="true">{icon}</span>}
        <span className="statistics-card__label">{label}</span>
      </div>
      <div className="statistics-kpi-card__value-row">
        <span className="statistics-card__value">{value}</span>
        {trend && <MiniSparkline label={`${label} trend`} points={trend} />}
      </div>
      {help && <span className="statistics-muted">{help}</span>}
      {comparison && (
        <span className="statistics-kpi-card__comparison" data-kind={comparison.kind}>
          {comparison.label}
        </span>
      )}
    </div>
  );
}
