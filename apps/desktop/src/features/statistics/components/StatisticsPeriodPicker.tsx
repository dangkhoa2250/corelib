import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import type { StatisticsPeriod, StatisticsPeriodUnit } from "../../../domain/statistics";
import { currentPeriod, formatPeriodLabel, isCurrentPeriod, shiftPeriod } from "../period";

interface StatisticsPeriodPickerProps {
  period: StatisticsPeriod;
  onChange(period: StatisticsPeriod): void;
  today?: string;
}

const UNITS: { unit: StatisticsPeriodUnit; label: string }[] = [
  { unit: "week", label: "Week" },
  { unit: "month", label: "Month" },
  { unit: "year", label: "Year" },
];

export function StatisticsPeriodPicker({ period, onChange, today }: StatisticsPeriodPickerProps) {
  const unitLabel = period.unit[0].toUpperCase() + period.unit.slice(1);
  const current = isCurrentPeriod(period, today);
  return (
    <div className="statistics-range-picker">
      <div>
        {UNITS.map(({ unit, label }) => (
          <button key={unit} className="statistics-control" aria-pressed={period.unit === unit} onClick={() => onChange(currentPeriod(unit, today))} type="button">
            {label}
          </button>
        ))}
      </div>
      <div>
        <button className="statistics-control" type="button" aria-label={`Previous ${period.unit}`} title={`Previous ${period.unit}`} onClick={() => onChange(shiftPeriod(period, -1))}>
          <IconChevronLeft aria-hidden="true" size={16} />
        </button>
        <span aria-label={`${unitLabel} period`}>{formatPeriodLabel(period)}</span>
        <button className="statistics-control" type="button" aria-label={`Next ${period.unit}`} title={`Next ${period.unit}`} disabled={current} onClick={() => onChange(shiftPeriod(period, 1))}>
          <IconChevronRight aria-hidden="true" size={16} />
        </button>
      </div>
    </div>
  );
}
