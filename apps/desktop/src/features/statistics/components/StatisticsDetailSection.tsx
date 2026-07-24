import type { ReactNode } from "react";
import {
  StatisticsEmptyState,
  StatisticsErrorState,
  StatisticsSkeleton,
} from "./StatisticsStates";

interface StatisticsDetailSectionProps {
  title: string;
  action?: ReactNode;
  state?: "loading" | "empty" | "error" | "loaded";
  errorMessage?: string;
  onRetry?(): void;
  children?: ReactNode;
}

export function StatisticsDetailSection({
  title,
  action,
  state = "loaded",
  errorMessage,
  onRetry,
  children,
}: StatisticsDetailSectionProps) {
  return (
    <section className="statistics-detail-section">
      <div className="statistics-section__header">
        <h2 className="statistics-section__title">{title}</h2>
        {action ? (
          <div className="statistics-section__action">{action}</div>
        ) : null}
      </div>
      {state === "loading" ? <StatisticsSkeleton /> : null}
      {state === "empty" ? <StatisticsEmptyState /> : null}
      {state === "error" ? (
        <StatisticsErrorState message={errorMessage} onRetry={onRetry} />
      ) : null}
      {state === "loaded" ? children : null}
    </section>
  );
}
