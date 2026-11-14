import { describe, expect, it } from "vitest";
import {
  addWeeksToYearWeekLocal,
  displayMonthForWeekNavigation,
  getCalendarYearMonthForWeekLocal,
  getISOWeekDateRangeLocal,
  getWeekDates,
  getWeeksInMonthLocal,
  getYearWeekForDateLocal,
  isoWeeksInYearLocal,
} from "./timeReportBrowserWeek";
import {
  addWeeksToYearWeek,
  getISOWeekDateRange,
  getISOWeekDateStrings,
  getWeeksInMonth,
  getYearWeekForDate,
  isoWeeksInYear,
} from "./dateUtils";

describe("timeReportBrowserWeek parity with dateUtils", () => {
  it("getISOWeekDateRangeLocal matches getISOWeekDateRange for sample years", () => {
    for (const [y, w] of [
      [2024, 1],
      [2024, 52],
      [2025, 10],
    ] as const) {
      expect(getISOWeekDateRangeLocal(y, w)).toEqual(getISOWeekDateRange(y, w));
    }
  });

  it("getYearWeekForDateLocal matches getYearWeekForDate", () => {
    const d = new Date(2024, 2, 15);
    expect(getYearWeekForDateLocal(d)).toEqual(getYearWeekForDate(d));
  });

  it("isoWeeksInYearLocal matches isoWeeksInYear", () => {
    for (const y of [2019, 2024, 2026]) {
      expect(isoWeeksInYearLocal(y)).toBe(isoWeeksInYear(y));
    }
  });

  it("addWeeksToYearWeekLocal matches addWeeksToYearWeek", () => {
    expect(addWeeksToYearWeekLocal(2024, 5, 11)).toEqual(
      addWeeksToYearWeek(2024, 5, 11)
    );
  });

  it("getWeeksInMonthLocal matches getWeeksInMonth", () => {
    expect(getWeeksInMonthLocal(11, 2025)).toEqual(getWeeksInMonth(11, 2025));
  });

  it("getWeekDates returns Mon..Sun like dateUtils week strings", () => {
    expect(getWeekDates(2024, 33)).toEqual(getISOWeekDateStrings(2024, 33));
  });
});

describe("week-view month-arrow navigation (ROV-74)", () => {
  it("September 2026 week 36 previous calendar month starts at week 31 (the reported skip)", () => {
    const augustWeeks = getWeeksInMonthLocal(8, 2026);
    expect(augustWeeks[0]).toEqual({ year: 2026, week: 31 });
    expect(addWeeksToYearWeekLocal(2026, 36, -1)).toEqual({ year: 2026, week: 35 });
  });

  it("September 2026 week 36 belongs to September; week 35 does not", () => {
    const septemberWeeks = getWeeksInMonthLocal(9, 2026);
    expect(septemberWeeks[0]).toEqual({ year: 2026, week: 36 });
    expect(septemberWeeks.some((w) => w.week === 35 && w.year === 2026)).toBe(false);
    expect(getCalendarYearMonthForWeekLocal(2026, 36)).toEqual({ year: 2026, month: 9 });
    expect(getCalendarYearMonthForWeekLocal(2026, 35)).toEqual({ year: 2026, month: 8 });
  });

  it("steps one week and only changes the month selector when the week leaves that month", () => {
    expect(displayMonthForWeekNavigation(2026, 9, 2026, 35)).toEqual({
      year: 2026,
      month: 8,
    });
    expect(displayMonthForWeekNavigation(2026, 9, 2026, 37)).toEqual({
      year: 2026,
      month: 9,
    });
    expect(displayMonthForWeekNavigation(2026, 8, 2026, 36)).toEqual({
      year: 2026,
      month: 8,
    });
    expect(displayMonthForWeekNavigation(2026, 8, 2026, 37)).toEqual({
      year: 2026,
      month: 9,
    });
  });

  it("September 2025 week 36 also steps to week 35 instead of August week 31", () => {
    expect(getWeeksInMonthLocal(8, 2025)[0]).toEqual({ year: 2025, week: 31 });
    expect(addWeeksToYearWeekLocal(2025, 36, -1)).toEqual({ year: 2025, week: 35 });
    expect(displayMonthForWeekNavigation(2025, 9, 2025, 35)).toEqual({
      year: 2025,
      month: 8,
    });
  });
});
