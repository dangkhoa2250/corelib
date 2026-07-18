import type { ReactNode } from "react";
import { StatisticsSkeleton, StatisticsEmptyState, StatisticsErrorState } from "./StatisticsStates";

interface MetricSectionProps {
  title: string;
  action?: ReactNode;
  state?: "loading" | "empty" | "error" | "loaded";
  errorMessage?: string;
  onRetry?(): void;
  children?: ReactNode;
}

export function MetricSection({ title, action, state = "loaded", errorMessage, onRetry, children }: MetricSectionProps) {
  return (
    <section className="statistics-section">
      <div className="statistics-section__header">
        <h2 className="statistics-section__title">{title}</h2>
        {action && <div className="statistics-section__action">{action}</div>}
      </div>
      {state === "loading" && <StatisticsSkeleton />}
      {state === "empty" && <StatisticsEmptyState />}
      {state === "error" && <StatisticsErrorState message={errorMessage} onRetry={onRetry} />}
      {state === "loaded" && children}
    </section>
  );
}
