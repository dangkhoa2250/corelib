import type { AdminAnalyticsRange } from "../../domain/account";

const RANGES: { value: AdminAnalyticsRange; label: string }[] = [
  { value: "7d", label: "7 days" }, { value: "30d", label: "30 days" },
  { value: "1y", label: "1 year" }, { value: "all", label: "All time" },
];

export function AdminAnalyticsRangePicker({ range, onChange }: { range: AdminAnalyticsRange; onChange(range: AdminAnalyticsRange): void }) {
  return <div className="statistics-range-picker">{RANGES.map(({ value, label }) => <button key={value} type="button" className="statistics-control" aria-pressed={range === value} onClick={() => onChange(value)}>{label}</button>)}</div>;
}
