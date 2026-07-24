export interface StatisticsMetric {
  id: string;
  label: string;
  value: string;
  help?: string;
  emphasis?: "primary" | "secondary";
}

interface StatisticsMetricStripProps {
  ariaLabel: string;
  metrics: StatisticsMetric[];
}

export function StatisticsMetricStrip({
  ariaLabel,
  metrics,
}: StatisticsMetricStripProps) {
  return (
    <dl className="statistics-metric-strip" role="list" aria-label={ariaLabel}>
      {metrics.map((metric) => (
        <div
          className="statistics-metric-strip__item"
          data-emphasis={metric.emphasis ?? "secondary"}
          key={metric.id}
          role="listitem"
        >
          <dt>{metric.label}</dt>
          <dd>{metric.value}</dd>
          {metric.help ? <span>{metric.help}</span> : null}
        </div>
      ))}
    </dl>
  );
}
