export function parseIncidentDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Use a valid date in YYYY-MM-DD format");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("Use a valid calendar date");
  }
  return value;
}

export function parseIncidentPage(value: string | undefined): number {
  if (!value || !/^[1-9]\d*$/.test(value)) return 1;
  return Math.min(Number(value), 10000);
}

export function resolveIncidentPeriod(
  filters: { from?: string; to?: string },
  today: string
): { from: string; to: string } {
  const to = parseIncidentDate(filters.to) ?? today;
  const defaultFrom = new Date(`${to}T00:00:00Z`);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);
  const from = parseIncidentDate(filters.from) ?? defaultFrom.toISOString().slice(0, 10);
  if (from > to) throw new Error("From date must be on or before to date");
  if (from > today || to > today) throw new Error("Dates cannot be in the future");
  return { from, to };
}

/** Uptime inferred from recorded incident downtime within the measured period. */
export function incidentUptimePercent(periodMinutes: number, downtimeMinutes: number): number | null {
  if (periodMinutes <= 0) return null;
  return Math.max(0, Math.min(100, 100 * (1 - downtimeMinutes / periodMinutes)));
}
