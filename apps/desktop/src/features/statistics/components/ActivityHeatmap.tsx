import { useCallback, useEffect, useMemo, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { StatisticsRange } from "../../../domain/statistics";

interface ActivityHeatmapProps {
  data: Record<string, number>;
  range: StatisticsRange;
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
  for (let i = 0; i < count; i++) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (count - 1 - i));
    const ds = dateStr(date);
    const minutes = data[ds] ?? 0;
    const level = getLevel(minutes);
    const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000);
    const jan1Dow = new Date(date.getFullYear(), 0, 1).getDay();
    const column = Math.floor((dayOfYear - 1 + jan1Dow) / 7) + 1;
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
  if (days.length === 0) return { activeDays: 0, peakLevel: 0, currentStreak: 0 };
  const activeDays = days.filter((d) => d.minutes > 0).length;
  const peakLevel = Math.max(...days.map((d) => d.level));
  const sorted = [...days].sort((a, b) => b.date.getTime() - a.date.getTime());
  let streak = 0;
  for (const d of sorted) {
    if (d.minutes > 0) streak++;
    else break;
  }
  return { activeDays, peakLevel, currentStreak: streak };
}

export function ActivityHeatmap({ data, range, palette }: ActivityHeatmapProps) {
  const grids: YearGrid[] = useMemo(() => {
    if (range === "all") {
      const cy = new Date().getFullYear();
      return [cy - 1, cy, cy + 1].map((year) => {
        const days = buildYearDays(year, data);
        return { year, days, maxColumn: maxColumn(days) };
      });
    }
    const count = range === "7d" ? 7 : range === "30d" ? 30 : 365;
    const days = buildRecentDays(count, data);
    return [{ year: new Date().getFullYear(), days, maxColumn: maxColumn(days) }];
  }, [data, range]);

  const allDays = useMemo(() => grids.flatMap((g) => g.days), [grids]);

  const summary = useMemo(() => computeSummary(allDays), [allDays]);

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
      {grids.map((grid, gridIdx) => (
        <div
          key={gridIdx}
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
      ))}
      <div className="sr-only" aria-live="polite">
        Summary: {summary.activeDays} active days. Peak level: {summary.peakLevel}. Current streak:{" "}
        {summary.currentStreak} days.
      </div>
    </div>
  );
}
