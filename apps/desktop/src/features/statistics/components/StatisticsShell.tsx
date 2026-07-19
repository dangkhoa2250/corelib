import type { ReactNode } from "react";
import { ScrollArea } from "../../../components/ScrollArea";
import type { StatisticsPeriod } from "../../../domain/statistics";
import { StatisticsPeriodPicker } from "./StatisticsPeriodPicker";

interface StatisticsShellProps {
  title: string;
  onBack?: () => void;
  breadcrumb?: string;
  period?: StatisticsPeriod;
  onPeriodChange?: (period: StatisticsPeriod) => void;
  children?: ReactNode;
}

export function StatisticsShell({
  title,
  onBack,
  breadcrumb,
  period,
  onPeriodChange,
  children,
}: StatisticsShellProps) {
  return (
    <div className="statistics-shell">
      <ScrollArea data-testid="statistics-scroll-area">
        <div
          data-testid="statistics-scroll-content"
          className="statistics-shell__content"
        >
          <header className="statistics-shell__header">
            <div className="statistics-shell__heading">
              {onBack ? (
                <button
                  aria-label="Back"
                  className="statistics-back-button"
                  onClick={onBack}
                  type="button"
                >
                  <span aria-hidden="true">←</span>
                  Back
                </button>
              ) : null}
              {breadcrumb ? <p className="statistics-breadcrumb">{breadcrumb}</p> : null}
              <h1>{title}</h1>
            </div>
            {period && onPeriodChange ? (
              <StatisticsPeriodPicker period={period} onChange={onPeriodChange} />
            ) : null}
          </header>
          {children}
        </div>
      </ScrollArea>
    </div>
  );
}
