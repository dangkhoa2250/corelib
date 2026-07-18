interface StatisticsErrorStateProps {
  message?: string;
  onRetry?(): void;
}

export function StatisticsSkeleton() {
  return <div className="statistics-skeleton">Loading...</div>;
}

export function StatisticsEmptyState() {
  return (
    <div className="statistics-empty-state">
      <p>No data yet. Use Reading or Memora to see your activity here.</p>
    </div>
  );
}

export function StatisticsErrorState({ message, onRetry }: StatisticsErrorStateProps) {
  return (
    <div className="statistics-error-state">
      <p>{message ?? "Something went wrong loading statistics."}</p>
      {onRetry && <button onClick={onRetry}>Retry</button>}
    </div>
  );
}
