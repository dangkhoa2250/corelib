import type { StatisticsRange } from "../../../domain/statistics";

interface StatisticsRangePickerProps {
  range: StatisticsRange;
  onChange(range: StatisticsRange): void;
}

const RANGES: { value: StatisticsRange; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "1y", label: "1 year" },
  { value: "all", label: "All time" },
];

export function StatisticsRangePicker({ range, onChange }: StatisticsRangePickerProps) {
  return (
    <div className="statistics-range-picker">
      {RANGES.map((r) => (
        <button
          key={r.value}
          className="statistics-control"
          aria-pressed={range === r.value}
          onClick={() => onChange(r.value)}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
