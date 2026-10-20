export const WORK_ESTIMATE_HOURS_MAX = 9999;

export function parseWorkEstimateHours(
  raw: string
): { ok: true; value: number | null } | { ok: false } {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) return { ok: true, value: null };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || value > WORK_ESTIMATE_HOURS_MAX) {
    return { ok: false };
  }
  return { ok: true, value: Math.round(value * 100) / 100 };
}

export function formatWorkHours(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  return `${rounded}h`;
}

export function formatWorkHoursPair(loggedHours: number, estimateHours: number | null): string {
  if (estimateHours == null) return formatWorkHours(loggedHours);
  return `${formatWorkHours(loggedHours)} / ${formatWorkHours(estimateHours)}`;
}

/** Format hours according to which Work visibility flags the viewer has. */
export function formatVisibleWorkHours(
  loggedHours: number,
  estimateHours: number | null,
  opts: { showEstimates: boolean; showReportedTime: boolean }
): string | null {
  if (opts.showReportedTime && opts.showEstimates) {
    return formatWorkHoursPair(loggedHours, estimateHours);
  }
  if (opts.showReportedTime) return formatWorkHours(loggedHours);
  if (opts.showEstimates) {
    return estimateHours == null ? null : formatWorkHours(estimateHours);
  }
  return null;
}

export function workTimeBarPercents(
  loggedHours: number,
  estimateHours: number | null
): { loggedPct: number; estimatePct: number; over: boolean } {
  const estimate = estimateHours ?? 0;
  const logged = Math.max(0, loggedHours);
  const max = Math.max(estimate, logged, 0);
  if (max <= 0) {
    return { loggedPct: 0, estimatePct: 0, over: false };
  }
  return {
    loggedPct: Math.min(100, (logged / max) * 100),
    estimatePct: Math.min(100, (estimate / max) * 100),
    over: estimate > 0 && logged > estimate,
  };
}

export function hasWorkTimeToShow(
  estimateHours: number | null,
  loggedHours: number
): boolean {
  return (estimateHours != null && estimateHours > 0) || loggedHours > 0;
}
