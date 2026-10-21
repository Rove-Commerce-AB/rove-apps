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
