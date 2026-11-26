/**
 * Serialize a Postgres `DATE` value to `YYYY-MM-DD`.
 *
 * `node-pg` parses DATE as a JS Date at midnight *local* time. Using
 * `toISOString()` (UTC) shifts the calendar day west of UTC (e.g. Sweden).
 * Never use `String(date).slice(0, 10)` — that yields `"Tue Nov 25"`, not ISO.
 */
export function pgDateToDateOnly(value: Date | string): string {
  if (typeof value === "string") {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
    if (!match?.[1]) {
      throw new Error(`Invalid date value: ${value}`);
    }
    return match[1];
  }
  const y = value.getFullYear();
  const m = value.getMonth() + 1;
  const d = value.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function pgDateToDateOnlyOrNull(
  value: Date | string | null | undefined
): string | null {
  if (value == null || value === "") return null;
  return pgDateToDateOnly(value);
}

/** Calendar `YYYY-MM-DD` in a timezone (Rove business day defaults to Stockholm). */
export function todayDateOnly(timeZone = "Europe/Stockholm"): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (name: string) =>
    parts.find((item) => item.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
