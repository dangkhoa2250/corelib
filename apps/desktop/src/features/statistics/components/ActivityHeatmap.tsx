import { useCallback, useEffect, useMemo, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { StatisticsPeriod } from "../../../domain/statistics";
import { ScrollArea } from "../../../components/ScrollArea";

interface ActivityHeatmapProps {
  data: Record<string, number>;
  period: StatisticsPeriod;
  palette: string[];
}

interface DayInfo {
  date: Date;
  dateStr: string;
  minutes: number;
  level: number;
  column: number;
  row: number;
}

interface YearGrid {
  year: number;
  days: DayInfo[];
  maxColumn: number;
}

function getLevel(minutes: number): number {
  if (minutes <= 0) return 0;
  if (minutes < 15) return 1;
  if (minutes < 30) return 2;
  if (minutes < 60) return 3;
  if (minutes < 120) return 4;
  return 5;
}

function fmt(n: number): string {
  return n.toString().padStart(2, "0");
}

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${fmt(d.getMonth() + 1)}-${fmt(d.getDate())}`;
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInYear(y: number): number {
  return isLeapYear(y) ? 366 : 365;
}

function buildYearDays(year: number, data: Record<string, number>): DayInfo[] {
  const total = daysInYear(year);
  const jan1 = new Date(year, 0, 1);
  const jan1Dow = jan1.getDay();
  const result: DayInfo[] = [];
  for (let i = 0; i < total; i++) {
    const date = new Date(year, 0, 1 + i);
    const ds = dateStr(date);
    const minutes = data[ds] ?? 0;
    const level = getLevel(minutes);
    const column = Math.floor((i + jan1Dow) / 7) + 1;
    result.push({ date, dateStr: ds, minutes, level, column, row: date.getDay() + 1 });
  }
  return result;
}

function buildRecentDays(count: number, data: Record<string, number>): DayInfo[] {
  const today = new Date();
  const result: DayInfo[] = [];
  const first = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (count - 1));
  const firstDow = first.getDay();
  for (let i = 0; i < count; i++) {
    const date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
    const ds = dateStr(date);
    const minutes = data[ds] ?? 0;
    const level = getLevel(minutes);
    const column = Math.floor((i + firstDow) / 7) + 1;
    result.push({ date, dateStr: ds, minutes, level, column, row: date.getDay() + 1 });
  }
  return result;
}

function maxColumn(days: DayInfo[]): number {
  return days.length > 0 ? Math.max(...days.map((d) => d.column)) : 0;
}

function cellLabel(date: Date, minutes: number): string {
  const formatted = date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  if (minutes === 0) return `${formatted} — No activity`;
  return `${formatted} — ${minutes} minutes of activity`;
}

function cellTooltip(date: Date, minutes: number): string {
  const formatted = date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  if (minutes === 0) return `${formatted} — No activity`;
  return `${formatted} — ${minutes} minutes of activity`;
}

function computeSummary(days: DayInfo[]) {
  if (days.length === 0) return { activeDays: 0, peakLevel: 0, currentStreak: 0, totalMinutes: 0, highest: null as DayInfo | null };
  const activeDays = days.filter((d) => d.minutes > 0).length;
  const peakLevel = Math.max(...days.map((d) => d.level));
  const totalMinutes = days.reduce((total, day) => total + day.minutes, 0);
  const highest = days.reduce<DayInfo | null>((best, day) => !best || day.minutes > best.minutes ? day : best, null);
  const sorted = [...days].sort((a, b) => b.date.getTime() - a.date.getTime());
  let streak = 0;
  for (const d of sorted) {
    if (d.minutes > 0) streak++;
    else break;
  }
  return { activeDays, peakLevel, currentStreak: streak, totalMinutes, highest };
}

export function ActivityHeatmap({ data, period, palette }: ActivityHeatmapProps) {
  const grids: YearGrid[] = useMemo(() => {
    if (period.unit === "year") {
      const currentYear = new Date().getFullYear();
      const dataYears = Array.from(new Set(
        Object.keys(data)
          .map((key) => Number(key.slice(0, 4)))
          .filter((year) => Number.isInteger(year) && year <= currentYear),
      )).sort((a, b) => b - a);
      const years = (dataYears.length > 0 ? dataYears : [currentYear]).slice(0, 3);
      return years.map((year) => {
        const days = buildYearDays(year, data);
        return { year, days, maxColumn: maxColumn(days) };
      });
    }
    const count = period.unit === "week" ? 7 : 31;
    const days = buildRecentDays(count, data);
    return [{ year: new Date().getFullYear(), days, maxColumn: maxColumn(days) }];
  }, [data, period]);

  const allDays = useMemo(() => grids.flatMap((g) => g.days), [grids]);

  const summary = useMemo(() => computeSummary(allDays), [allDays]);
  const highestDayLabel = summary.highest && summary.highest.minutes > 0
    ? summary.highest.date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  const [focused, setFocused] = useState(() => {
    for (let g = 0; g < grids.length; g++) {
      for (let d = 0; d < grids[g].days.length; d++) {
        if (grids[g].days[d].minutes > 0) {
          return { gridIdx: g, dayIdx: d };
        }
      }
    }
    const lastGrid = grids[grids.length - 1];
    if (lastGrid && lastGrid.days.length > 0) {
      return { gridIdx: grids.length - 1, dayIdx: lastGrid.days.length - 1 };
    }
    return { gridIdx: 0, dayIdx: 0 };
  });

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(
      `[data-cell-idx="${focused.gridIdx}-${focused.dayIdx}"]`,
    );
    el?.focus();
  }, [focused]);

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>, gridIdx: number) => {
      const grid = grids[gridIdx];
      if (!grid) return;
      if (gridIdx !== focused.gridIdx) return;

      let next = focused.dayIdx;
      switch (e.key) {
        case "ArrowRight":
          next = Math.min(focused.dayIdx + 1, grid.days.length - 1);
          break;
        case "ArrowLeft":
          next = Math.max(focused.dayIdx - 1, 0);
          break;
        case "ArrowUp":
          next = Math.max(focused.dayIdx - 7, 0);
          break;
        case "ArrowDown":
          next = Math.min(focused.dayIdx + 7, grid.days.length - 1);
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = grid.days.length - 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      setFocused({ gridIdx, dayIdx: next });
    },
    [grids, focused],
  );

  const paletteVars = {
    "--statistics-level-1": palette[0],
    "--statistics-level-2": palette[1],
    "--statistics-level-3": palette[2],
    "--statistics-level-4": palette[3],
    "--statistics-level-5": palette[4],
  } as React.CSSProperties;

  return (
    <div className="statistics-heatmap-wrapper" style={paletteVars}>
      <ScrollArea data-testid="statistics-heatmap-scroll" className="statistics-heatmap-scroll">
        <div data-testid="statistics-heatmap-scroll-content" className="statistics-heatmap-scroll__content" style={{ paddingBottom: 20 }}>
          {grids.map((grid, gridIdx) => (
            <section key={grid.year} className="statistics-heatmap-year">
              {period.unit === "year" && <h3 className="statistics-heatmap-year__label">{grid.year}</h3>}
              <div
                role="grid"
                aria-label="Daily activity"
                className="statistics-heatmap"
                style={{
                  gridTemplateColumns: `repeat(${grid.maxColumn}, 14px)`,
                  gridTemplateRows: "repeat(7, 14px)",
                }}
                onKeyDown={(e) => handleKeyDown(e, gridIdx)}
              >
                {grid.days.map((day, dayIdx) => {
                  const isFocused = focused.gridIdx === gridIdx && focused.dayIdx === dayIdx;
                  return (
                    <div
                      key={day.dateStr}
                      role="gridcell"
                      tabIndex={isFocused ? 0 : -1}
                      data-level={day.level}
                      data-cell-idx={`${gridIdx}-${dayIdx}`}
                      data-date={day.dateStr}
                      aria-label={cellLabel(day.date, day.minutes)}
                      title={cellTooltip(day.date, day.minutes)}
                      className="statistics-heatmap__cell"
                      style={{ gridRow: day.row, gridColumn: day.column }}
                      onClick={() => setFocused({ gridIdx, dayIdx })}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </ScrollArea>
      <p className="statistics-heatmap__summary">
        {summary.totalMinutes} minutes across {summary.activeDays} active days.
        {highestDayLabel ? ` Highest day: ${highestDayLabel} (${summary.highest?.minutes} minutes).` : " No activity yet."}
      </p>
      <div className="sr-only" aria-live="polite">
        Summary: {summary.activeDays} active days. Peak level: {summary.peakLevel}. Current streak:{" "}
        {summary.currentStreak} days.
      </div>
    </div>
  );
}
