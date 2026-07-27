import type { StatisticsPeriod, StatisticsPeriodUnit } from "../../domain/statistics";

function parseDay(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

function dayString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function todayLocalDay(now = new Date()): string {
  return dayString(now);
}

export function currentPeriod(unit: StatisticsPeriodUnit, today = todayLocalDay()): StatisticsPeriod {
  const date = parseDay(today);
  if (unit === "week") date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  if (unit === "month") date.setDate(1);
  if (unit === "year") date.setMonth(0, 1);
  return { unit, anchorLocalDay: dayString(date) };
}

export function shiftPeriod(period: StatisticsPeriod, amount: -1 | 1): StatisticsPeriod {
  const date = parseDay(period.anchorLocalDay);
  if (period.unit === "week") date.setDate(date.getDate() + amount * 7);
  if (period.unit === "month") date.setMonth(date.getMonth() + amount, 1);
  if (period.unit === "year") date.setFullYear(date.getFullYear() + amount, 0, 1);
  return currentPeriod(period.unit, dayString(date));
}

export function isCurrentPeriod(period: StatisticsPeriod, today = todayLocalDay()): boolean {
  return period.anchorLocalDay === currentPeriod(period.unit, today).anchorLocalDay;
}

export function formatPeriodLabel(period: StatisticsPeriod, locale?: string): string {
  const start = parseDay(period.anchorLocalDay);
  if (period.unit === "year") return String(start.getFullYear());
  if (period.unit === "month") return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(start);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  const startText = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(start);
  const endText = new Intl.DateTimeFormat(locale, { day: "numeric" }).format(end);
  return `${startText}–${endText}, ${end.getFullYear()}`;
}
