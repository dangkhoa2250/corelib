import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import type { StatisticsPeriod, StatisticsTimeBucket } from "../../../domain/statistics";
import { todayLocalDay } from "../period";

const BUCKET_START_HOURS = [0, 4, 8, 12, 16, 20] as const;

export type StatisticsPalette = readonly [string, string, string, string, string] | readonly string[];

interface ActivityHeatmapProps {
  period: StatisticsPeriod;
  buckets: StatisticsTimeBucket[];
  selectedApp: string;
  palette: StatisticsPalette;
}

export interface HeatmapSlot {
  bucketStartHour: StatisticsTimeBucket["bucketStartHour"];
  activeMs: number;
  breakdown: ReadonlyMap<string, number>;
  dayActiveMs: ReadonlyMap<string, number>;
}

export interface HeatmapColumn {
  key: string;
  label: string;
  ariaLabel: string;
  localDays: string[];
  isFuture: boolean;
  slots: HeatmapSlot[];
}

interface FocusedCell {
  column: number;
  row: number;
}

function formatDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseLocalDay(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

function addDays(day: string, amount: number): string {
  const date = parseLocalDay(day);
  date.setDate(date.getDate() + amount);
  return formatDay(date);
}

function isoMonday(day: string): string {
  const date = parseLocalDay(day);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return formatDay(date);
}

function formatDate(day: string): string {
  return parseLocalDay(day).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatAxisDate(day: string): string {
  return parseLocalDay(day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatIncludedRange(localDays: string[]): string {
  if (localDays.length === 1) return formatDate(localDays[0]);
  const start = parseLocalDay(localDays[0]);
  const end = parseLocalDay(localDays[localDays.length - 1]);
  const startText = start.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const endText = end.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return `${startText}–${endText}`;
}

function periodDays(period: StatisticsPeriod): string[] {
  const start = parseLocalDay(period.anchorLocalDay);
  const count = period.unit === "week"
    ? 7
    : period.unit === "month"
      ? new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
      : Math.round((new Date(start.getFullYear() + 1, 0, 1).getTime() - start.getTime()) / 86_400_000);
  return Array.from({ length: count }, (_, index) => addDays(period.anchorLocalDay, index));
}

function displayAppName(appKey: string): string {
  return appKey.length === 0 ? appKey : `${appKey.slice(0, 1).toUpperCase()}${appKey.slice(1)}`;
}

function isBucketFuture(bucket: StatisticsTimeBucket, currentDay: string): boolean {
  return bucket.isFuture || bucket.localDay > currentDay;
}

/**
 * Normalizes the local four-hour buckets into exact calendar columns. The
 * function intentionally keeps active milliseconds as the sole cell measure;
 * nothing such as review counts or session counts is folded into intensity.
 */
export function buildHeatmapColumns(
  period: StatisticsPeriod,
  buckets: StatisticsTimeBucket[],
  selectedApp: string,
  currentDay = todayLocalDay(),
): HeatmapColumn[] {
  const days = periodDays(period);
  const columnDays = period.unit === "year"
    ? Array.from(days.reduce((columns, day) => {
      const monday = isoMonday(day);
      const existing = columns.get(monday) ?? [];
      existing.push(day);
      columns.set(monday, existing);
      return columns;
    }, new Map<string, string[]>()).entries())
    : days.map((day) => [day, [day]] as [string, string[]]);

  return columnDays.map(([key, localDays]) => {
    const localDaySet = new Set(localDays);
    const slots = BUCKET_START_HOURS.map((bucketStartHour) => {
      const breakdown = new Map<string, number>();
      const dayActiveMs = new Map<string, number>();
      for (const bucket of buckets) {
        if (
          bucket.bucketStartHour !== bucketStartHour
          || !localDaySet.has(bucket.localDay)
          || isBucketFuture(bucket, currentDay)
          || (selectedApp !== "all" && bucket.appKey !== selectedApp)
        ) {
          continue;
        }
        breakdown.set(bucket.appKey, (breakdown.get(bucket.appKey) ?? 0) + bucket.activeMs);
        dayActiveMs.set(bucket.localDay, (dayActiveMs.get(bucket.localDay) ?? 0) + bucket.activeMs);
      }
      return {
        bucketStartHour,
        activeMs: Array.from(breakdown.values()).reduce((total, value) => total + value, 0),
        breakdown,
        dayActiveMs,
      };
    });

    const isFuture = localDays.every((day) => day > currentDay);
    const isYear = period.unit === "year";
    return {
      key,
      label: isYear ? formatAxisDate(key) : formatAxisDate(localDays[0]),
      ariaLabel: isYear ? `Week of ${formatIncludedRange(localDays)}` : formatDate(localDays[0]),
      localDays,
      isFuture,
      slots,
    };
  });
}

export function heatmapIntensity(activeMs: number): number {
  if (activeMs <= 0) return 0;
  if (activeMs < 15 * 60_000) return 1;
  if (activeMs < 30 * 60_000) return 2;
  if (activeMs < 60 * 60_000) return 3;
  if (activeMs < 120 * 60_000) return 4;
  return 5;
}

function timeRange(bucketStartHour: number): string {
  return `${String(bucketStartHour).padStart(2, "0")}:00–${String(bucketStartHour + 4).padStart(2, "0")}:00`;
}

function formatDuration(activeMs: number): string {
  if (activeMs <= 0) return "0 minutes";
  const totalMinutes = Math.round(activeMs / 60_000);
  if (totalMinutes < 1) return "less than a minute";
  if (totalMinutes < 60) return `${totalMinutes} minute${totalMinutes === 1 ? "" : "s"}`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} hour${hours === 1 ? "" : "s"}` : `${hours}h ${minutes}m`;
}

function breakdownText(breakdown: ReadonlyMap<string, number>): string {
  const values = Array.from(breakdown.entries()).filter(([, activeMs]) => activeMs > 0);
  return values.length === 0
    ? ""
    : ` ${values.map(([appKey, activeMs]) => `${displayAppName(appKey)}: ${formatDuration(activeMs)}`).join(", ")}.`;
}

function sampleAxisLabels(columns: HeatmapColumn[]): Set<number> {
  const result = new Set<number>();
  const every = columns.length <= 7 ? 1 : Math.ceil(columns.length / 7);
  columns.forEach((_, index) => {
    if (index % every === 0 || index === columns.length - 1) result.add(index);
  });
  return result;
}

function cellDescription(column: HeatmapColumn, slot: HeatmapSlot): string {
  const range = timeRange(slot.bucketStartHour);
  if (column.isFuture) return `${column.ariaLabel}, ${range}: Unavailable (future date).`;
  return `${column.ariaLabel}, ${range}: ${formatDuration(slot.activeMs)} of activity.${breakdownText(slot.breakdown)}`;
}

function computeSummary(columns: HeatmapColumn[]) {
  const dayTotals = new Map<string, number>();
  const bucketTotals = new Map<number, number>();
  const columnTotals: { column: HeatmapColumn; activeMs: number }[] = [];

  for (const column of columns) {
    const activeMs = column.isFuture ? 0 : column.slots.reduce((total, slot) => total + slot.activeMs, 0);
    columnTotals.push({ column, activeMs });
    for (const slot of column.slots) {
      bucketTotals.set(slot.bucketStartHour, (bucketTotals.get(slot.bucketStartHour) ?? 0) + (column.isFuture ? 0 : slot.activeMs));
    }
    for (const day of column.localDays) {
      const activeMs = column.isFuture ? 0 : column.slots.reduce(
        (total, slot) => total + (slot.dayActiveMs.get(day) ?? 0),
        0,
      );
      dayTotals.set(day, activeMs);
    }
  }

  const totalActiveMs = columnTotals.reduce((total, item) => total + item.activeMs, 0);
  const activeDays = Array.from(dayTotals.values()).filter((activeMs) => activeMs > 0).length;
  const strongestBucket = BUCKET_START_HOURS.reduce((best, hour) =>
    (bucketTotals.get(hour) ?? 0) > (bucketTotals.get(best) ?? 0) ? hour : best,
  BUCKET_START_HOURS[0]);
  const highest = columnTotals.reduce<{ column: HeatmapColumn; activeMs: number } | null>(
    (best, item) => !best || item.activeMs > best.activeMs ? item : best,
    null,
  );
  return { totalActiveMs, activeDays, strongestBucket, highest };
}

export function ActivityHeatmap({ period, buckets, selectedApp, palette }: ActivityHeatmapProps) {
  const currentDay = todayLocalDay();
  const columns = useMemo(
    () => buildHeatmapColumns(period, buckets, selectedApp, currentDay),
    [buckets, currentDay, period, selectedApp],
  );
  const summary = useMemo(() => computeSummary(columns), [columns]);
  const sampledLabels = useMemo(() => sampleAxisLabels(columns), [columns]);
  const [focused, setFocused] = useState<FocusedCell>({ column: 0, row: 0 });
  const [tooltip, setTooltip] = useState<string | null>(null);
  const shouldMoveFocus = useRef(false);

  useEffect(() => {
    setFocused((previous) => ({
      column: Math.min(previous.column, Math.max(columns.length - 1, 0)),
      row: Math.min(previous.row, BUCKET_START_HOURS.length - 1),
    }));
  }, [columns.length]);

  useEffect(() => {
    if (!shouldMoveFocus.current) return;
    shouldMoveFocus.current = false;
    const focusedCell = document.querySelector<HTMLElement>(
      `[data-heatmap-cell="${focused.column}-${focused.row}"]`,
    );
    focusedCell?.focus();
  }, [focused]);

  const moveFocus = (event: ReactKeyboardEvent<HTMLElement>, column: number, row: number) => {
    let nextColumn = column;
    let nextRow = row;
    switch (event.key) {
      case "ArrowRight":
        nextColumn = Math.min(column + 1, columns.length - 1);
        break;
      case "ArrowLeft":
        nextColumn = Math.max(column - 1, 0);
        break;
      case "ArrowDown":
        nextRow = Math.min(row + 1, BUCKET_START_HOURS.length - 1);
        break;
      case "ArrowUp":
        nextRow = Math.max(row - 1, 0);
        break;
      case "Home":
        nextColumn = 0;
        break;
      case "End":
        nextColumn = columns.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    shouldMoveFocus.current = true;
    setFocused({ column: nextColumn, row: nextRow });
  };

  const paletteVars = {
    "--statistics-level-1": palette[0],
    "--statistics-level-2": palette[1],
    "--statistics-level-3": palette[2],
    "--statistics-level-4": palette[3],
    "--statistics-level-5": palette[4],
    "--column-count": columns.length,
  } as CSSProperties;
  const highestLabel = summary.highest && summary.highest.activeMs > 0
    ? `${period.unit === "year" ? "Highest week" : "Highest day"}: ${summary.highest.column.ariaLabel.replace(/^Week of /, "")}`
    : "No activity yet";
  const visibleSummary = summary.totalActiveMs === 0
    ? "No activity yet. No peak time yet."
    : `${formatDuration(summary.totalActiveMs)} across ${summary.activeDays} active day${summary.activeDays === 1 ? "" : "s"}. Strongest time: ${timeRange(summary.strongestBucket)}. ${highestLabel}.`;

  return (
    <div className={`statistics-heatmap-wrapper statistics-heatmap-wrapper--${period.unit}`} style={paletteVars}>
      <div className="statistics-heatmap__layout">
        <div className="statistics-heatmap__y-axis" aria-hidden="true">
          <span className="statistics-heatmap__y-axis-start">0h</span>
          <div className="statistics-heatmap__y-axis-boundaries">
            {[4, 8, 12, 16, 20, 24].map((hour) => <span key={hour}>{hour}h</span>)}
          </div>
        </div>
        <div className="statistics-heatmap__plot">
          <div className="statistics-heatmap__x-axis" aria-hidden="true">
            {columns.map((column, index) => sampledLabels.has(index) ? (
              <span key={column.key} style={{ gridColumn: index + 1 }}>{column.label}</span>
            ) : null)}
          </div>
          <div role="grid" aria-label="Activity by time" aria-describedby="activity-heatmap-summary" className="statistics-heatmap">
            {BUCKET_START_HOURS.map((bucketStartHour, row) => (
              <div key={bucketStartHour} role="row" className="statistics-heatmap__row">
                {columns.map((column, columnIndex) => {
                  const slot = column.slots[row];
                  const description = cellDescription(column, slot);
                  const isFocused = focused.column === columnIndex && focused.row === row;
                  return (
                    <div
                      key={`${column.key}-${bucketStartHour}`}
                      role="gridcell"
                      tabIndex={isFocused ? 0 : -1}
                      aria-label={description}
                      aria-disabled={column.isFuture || undefined}
                      data-heatmap-cell={`${columnIndex}-${row}`}
                      data-level={column.isFuture ? 0 : heatmapIntensity(slot.activeMs)}
                      className="statistics-heatmap__cell"
                      title={description}
                      onFocus={() => {
                        setFocused({ column: columnIndex, row });
                        setTooltip(description);
                      }}
                      onBlur={() => setTooltip(null)}
                      onMouseEnter={() => setTooltip(description)}
                      onMouseLeave={() => setTooltip(null)}
                      onClick={() => setFocused({ column: columnIndex, row })}
                      onKeyDown={(event) => moveFocus(event, columnIndex, row)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p role="tooltip" className="statistics-heatmap__tooltip">{tooltip ?? "Focus or hover a cell for exact activity details."}</p>
      <p id="activity-heatmap-summary" data-testid="activity-heatmap-summary" className="statistics-heatmap__summary">{visibleSummary}</p>
      <p className="sr-only">Activity summary: {visibleSummary}</p>
    </div>
  );
}
