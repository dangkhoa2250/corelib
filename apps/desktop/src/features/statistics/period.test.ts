import { expect, test } from "vitest";
import { currentPeriod, formatPeriodLabel, isCurrentPeriod, shiftPeriod, todayLocalDay } from "./period";

test("normalizes and navigates calendar periods without UTC date parsing", () => {
  expect(todayLocalDay(new Date(2026, 6, 19))).toBe("2026-07-19");
  expect(currentPeriod("week", "2026-07-19")).toEqual({ unit: "week", anchorLocalDay: "2026-07-13" });
  expect(currentPeriod("month", "2026-07-19")).toEqual({ unit: "month", anchorLocalDay: "2026-07-01" });
  expect(currentPeriod("year", "2026-07-19")).toEqual({ unit: "year", anchorLocalDay: "2026-01-01" });
  expect(shiftPeriod({ unit: "month", anchorLocalDay: "2026-03-01" }, -1)).toEqual({ unit: "month", anchorLocalDay: "2026-02-01" });
  expect(isCurrentPeriod({ unit: "week", anchorLocalDay: "2026-07-13" }, "2026-07-19")).toBe(true);
});

test("formats English calendar labels", () => {
  expect(formatPeriodLabel({ unit: "week", anchorLocalDay: "2026-07-13" }, "en-US")).toBe("Jul 13–19, 2026");
  expect(formatPeriodLabel({ unit: "month", anchorLocalDay: "2026-07-01" }, "en-US")).toBe("July 2026");
  expect(formatPeriodLabel({ unit: "year", anchorLocalDay: "2026-01-01" }, "en-US")).toBe("2026");
});
