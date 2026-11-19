/**
 * Browser-local ISO week helpers for time report UI.
 * Kept separate from dateUtils to match existing SSR/client split for this page.
 */

export function getISOWeekDateRangeLocal(
  year: number,
  week: number
): { start: string; end: string } {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const yearStartMonday = new Date(jan4);
  yearStartMonday.setDate(jan4.getDate() - dayOfWeek + 1);
  const weekStart = new Date(yearStartMonday);
  weekStart.setDate(yearStartMonday.getDate() + (week - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const toYMD = (d: Date) =>
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0");
  return { start: toYMD(weekStart), end: toYMD(weekEnd) };
}

export function getYearWeekForDateLocal(date: Date): { year: number; week: number } {
  const isoDay = date.getDay() || 7;
  const thursdayOffset = 4 - isoDay;
  const thursday = new Date(date);
  thursday.setDate(date.getDate() + thursdayOffset);
  const year = thursday.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setDate(4 - jan4Day + 1);
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const week =
    1 + Math.floor((thursday.getTime() - week1Monday.getTime()) / msPerWeek);
  return { year, week };
}

export function isoWeeksInYearLocal(year: number): number {
  const dec28 = new Date(year, 11, 28);
  const isoDay = dec28.getDay() || 7;
  const thursdayOffset = 4 - isoDay;
  const thursday = new Date(dec28);
  thursday.setDate(dec28.getDate() + thursdayOffset);
  const isoYear = thursday.getFullYear();
  const jan4 = new Date(isoYear, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - jan4Day + 1);
  return (
    1 +
    Math.floor(
      (thursday.getTime() - week1Monday.getTime()) / (7 * 24 * 60 * 60 * 1000)
    )
  );
}

export function addWeeksToYearWeekLocal(
  year: number,
  week: number,
  delta: number
): { year: number; week: number } {
  let w = week + delta;
  let y = year;
  while (w > isoWeeksInYearLocal(y)) {
    w -= isoWeeksInYearLocal(y);
    y += 1;
  }
  while (w < 1) {
    y -= 1;
    w += isoWeeksInYearLocal(y);
  }
  return { year: y, week: w };
}

export function getWeeksInMonthLocal(
  month: number,
  year: number
): { year: number; week: number }[] {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const start = getYearWeekForDateLocal(first);
  const end = getYearWeekForDateLocal(last);
  const list: { year: number; week: number }[] = [];
  let y = start.year;
  let w = start.week;
  const endY = end.year;
  const endW = end.week;
  while (y < endY || (y === endY && w <= endW)) {
    list.push({ year: y, week: w });
    w += 1;
    if (w > isoWeeksInYearLocal(y)) {
      w = 1;
      y += 1;
    }
  }
  return list;
}

/** YYYY-MM-DD for each calendar day in the month (1-based month). */
export function getCalendarDatesInMonth(year: number, month: number): string[] {
  const last = new Date(year, month, 0).getDate();
  return Array.from({ length: last }, (_, i) => {
    const d = i + 1;
    return (
      year +
      "-" +
      String(month).padStart(2, "0") +
      "-" +
      String(d).padStart(2, "0")
    );
  });
}

/** YYYY-MM-DD for Mon..Sun of the given ISO week. */
export function getWeekDates(year: number, week: number): string[] {
  const { start } = getISOWeekDateRangeLocal(year, week);
  const monday = new Date(start + "T12:00:00");
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  });
}

/** Matches server/week revision maps and UI slice keys (`year-Wnn`). */
export function weekSliceKey(year: number, week: number): string {
  return `${year}-W${week}`;
}

/** Calendar year/month (1–12) for an ISO week, using that week’s Thursday. */
export function getCalendarYearMonthForWeekLocal(
  year: number,
  week: number
): { year: number; month: number } {
  const { start } = getISOWeekDateRangeLocal(year, week);
  const monday = new Date(start + "T12:00:00");
  const thursday = new Date(monday);
  thursday.setDate(monday.getDate() + 3);
  return { year: thursday.getFullYear(), month: thursday.getMonth() + 1 };
}

/**
 * Month selector + week-strip sync for ±1 week navigation.
 * Stay on the current calendar month while the week still belongs to it;
 * otherwise move to the week’s ISO (Thursday) month so the strip includes it.
 */
export function displayMonthForWeekNavigation(
  displayYear: number,
  displayMonth: number,
  weekYear: number,
  weekWeek: number
): { year: number; month: number } {
  const weeks = getWeeksInMonthLocal(displayMonth, displayYear);
  if (weeks.some((w) => w.year === weekYear && w.week === weekWeek)) {
    return { year: displayYear, month: displayMonth };
  }
  return getCalendarYearMonthForWeekLocal(weekYear, weekWeek);
}
