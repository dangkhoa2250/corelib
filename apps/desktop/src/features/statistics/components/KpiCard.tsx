interface KpiCardProps {
  label: string;
  value: string;
  help?: string;
  comparison?: string;
}

export function KpiCard({ label, value, help, comparison }: KpiCardProps) {
  return (
    <div className="statistics-card">
      <span className="statistics-card__label">{label}</span>
      <span className="statistics-card__value">{value}</span>
      {help && <span className="statistics-muted">{help}</span>}
      {comparison && <span className="statistics-muted">{comparison}</span>}
    </div>
  );
}
