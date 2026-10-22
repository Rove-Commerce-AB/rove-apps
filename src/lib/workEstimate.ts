import {
  DEFAULT_BILLING_CURRENCY,
  parseBillingCurrency,
  type BillingCurrency,
} from "@/lib/currency";
import { formatWorkHours, WORK_ESTIMATE_HOURS_MAX } from "@/lib/workTime";

export const WORK_ESTIMATE_UNITS = ["hours", "currency", "points"] as const;
export type WorkEstimateUnit = (typeof WORK_ESTIMATE_UNITS)[number];

export const WORK_ESTIMATE_UNIT_LABELS: Record<WorkEstimateUnit, string> = {
  hours: "Hours",
  currency: "Currency",
  points: "Points",
};

export const WORK_ESTIMATE_CURRENCY_MAX = 99_999_999.99;
export const WORK_ESTIMATE_POINTS_MAX = 9999;

export function isWorkEstimateUnit(value: string): value is WorkEstimateUnit {
  return (WORK_ESTIMATE_UNITS as readonly string[]).includes(value);
}

export function parseWorkEstimateUnit(
  value: string | null | undefined
): WorkEstimateUnit {
  const normalized = (value ?? "").trim().toLowerCase();
  return isWorkEstimateUnit(normalized) ? normalized : "hours";
}

export function workEstimateSuffix(
  unit: WorkEstimateUnit,
  currency: BillingCurrency = DEFAULT_BILLING_CURRENCY
): string {
  if (unit === "hours") return "h";
  if (unit === "points") return "pts";
  return parseBillingCurrency(currency);
}

export function formatWorkEstimate(
  value: number,
  unit: WorkEstimateUnit,
  currency: BillingCurrency = DEFAULT_BILLING_CURRENCY
): string {
  if (unit === "hours") return formatWorkHours(value);
  if (unit === "points") {
    const rounded = Math.round(value);
    return `${rounded} pts`;
  }
  const amount = Math.round(value * 100) / 100;
  const formatted = new Intl.NumberFormat("sv-SE", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
  return `${formatted} ${parseBillingCurrency(currency)}`;
}

export function formatWorkEstimatePair(
  loggedHours: number,
  estimate: number | null,
  unit: WorkEstimateUnit,
  currency: BillingCurrency = DEFAULT_BILLING_CURRENCY
): string {
  const logged = formatWorkHours(loggedHours);
  if (estimate == null) return logged;
  if (unit === "hours") {
    return `${logged} / ${formatWorkHours(estimate)}`;
  }
  return `${logged} · ${formatWorkEstimate(estimate, unit, currency)}`;
}

/** Format according to Work visibility flags and project estimate unit. */
export function formatVisibleWorkEstimate(
  loggedHours: number,
  estimate: number | null,
  opts: {
    showEstimates: boolean;
    showReportedTime: boolean;
    estimateUnit: WorkEstimateUnit;
    currency?: BillingCurrency;
  }
): string | null {
  const currency = opts.currency ?? DEFAULT_BILLING_CURRENCY;
  if (opts.showReportedTime && opts.showEstimates) {
    return formatWorkEstimatePair(
      loggedHours,
      estimate,
      opts.estimateUnit,
      currency
    );
  }
  if (opts.showReportedTime) return formatWorkHours(loggedHours);
  if (opts.showEstimates) {
    return estimate == null
      ? null
      : formatWorkEstimate(estimate, opts.estimateUnit, currency);
  }
  return null;
}

export function parseWorkEstimateValue(
  raw: string,
  unit: WorkEstimateUnit
): { ok: true; value: number | null } | { ok: false; message: string } {
  const trimmed = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!trimmed) return { ok: true, value: null };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) {
    return { ok: false, message: estimateParseError(unit) };
  }
  if (unit === "hours") {
    if (value > WORK_ESTIMATE_HOURS_MAX) {
      return { ok: false, message: estimateParseError(unit) };
    }
    return { ok: true, value: Math.round(value * 100) / 100 };
  }
  if (unit === "currency") {
    if (value > WORK_ESTIMATE_CURRENCY_MAX) {
      return { ok: false, message: estimateParseError(unit) };
    }
    return { ok: true, value: Math.round(value * 100) / 100 };
  }
  if (!Number.isInteger(value) || value > WORK_ESTIMATE_POINTS_MAX) {
    return { ok: false, message: estimateParseError(unit) };
  }
  return { ok: true, value };
}

export function estimateParseError(unit: WorkEstimateUnit): string {
  if (unit === "hours") {
    return `Estimate must be between 0 and ${WORK_ESTIMATE_HOURS_MAX} hours.`;
  }
  if (unit === "currency") {
    return `Estimate must be between 0 and ${WORK_ESTIMATE_CURRENCY_MAX}.`;
  }
  return `Estimate must be a whole number between 0 and ${WORK_ESTIMATE_POINTS_MAX} points.`;
}

/** Whether logged time can be compared to estimate (same unit). */
export function workEstimateComparesToLogged(
  unit: WorkEstimateUnit
): boolean {
  return unit === "hours";
}
