import {
  DEFAULT_BILLING_CURRENCY,
  parseBillingCurrency,
  type BillingCurrency,
} from "@/lib/currency";
import { formatWorkHours, WORK_ESTIMATE_HOURS_MAX } from "@/lib/workTime";

export const WORK_ESTIMATE_UNITS = ["hours", "currency", "tshirt"] as const;
export type WorkEstimateUnit = (typeof WORK_ESTIMATE_UNITS)[number];

export const WORK_ESTIMATE_UNIT_LABELS: Record<WorkEstimateUnit, string> = {
  hours: "Hours",
  currency: "Currency",
  tshirt: "T-shirt",
};

export const WORK_TSHIRT_SIZES = ["xs", "s", "m", "l", "xl"] as const;
export type WorkTshirtSize = (typeof WORK_TSHIRT_SIZES)[number];

export const WORK_TSHIRT_SIZE_LABELS: Record<WorkTshirtSize, string> = {
  xs: "XS",
  s: "S",
  m: "M",
  l: "L",
  xl: "XL",
};

export const WORK_ESTIMATE_CURRENCY_MAX = 99_999_999.99;

export function isWorkEstimateUnit(value: string): value is WorkEstimateUnit {
  return (WORK_ESTIMATE_UNITS as readonly string[]).includes(value);
}

export function parseWorkEstimateUnit(
  value: string | null | undefined
): WorkEstimateUnit {
  const normalized = (value ?? "").trim().toLowerCase();
  // Legacy unit before t-shirt replacement.
  if (normalized === "points") return "tshirt";
  return isWorkEstimateUnit(normalized) ? normalized : "hours";
}

export function isWorkTshirtSize(value: string): value is WorkTshirtSize {
  return (WORK_TSHIRT_SIZES as readonly string[]).includes(value);
}

export function parseWorkTshirtSize(
  value: string | null | undefined
): WorkTshirtSize | null {
  if (value == null) return null;
  const normalized = value.trim().toLowerCase();
  return isWorkTshirtSize(normalized) ? normalized : null;
}

export function workEstimateSuffix(
  unit: WorkEstimateUnit,
  currency: BillingCurrency = DEFAULT_BILLING_CURRENCY
): string {
  if (unit === "hours") return "h";
  if (unit === "tshirt") return "size";
  return parseBillingCurrency(currency);
}

export function formatWorkTshirtSize(size: WorkTshirtSize): string {
  return WORK_TSHIRT_SIZE_LABELS[size];
}

export function formatWorkMoneyAmount(
  value: number,
  currency: BillingCurrency = DEFAULT_BILLING_CURRENCY
): string {
  const amount = Math.round(value * 100) / 100;
  const formatted = new Intl.NumberFormat("sv-SE", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
  return `${formatted} ${parseBillingCurrency(currency)}`;
}

export function formatWorkEstimate(
  value: number,
  unit: WorkEstimateUnit,
  currency: BillingCurrency = DEFAULT_BILLING_CURRENCY
): string {
  if (unit === "hours") return formatWorkHours(value);
  if (unit === "tshirt") {
    // Numeric estimates are not used for t-shirt; callers should use size.
    return formatWorkMoneyAmount(value, currency);
  }
  return formatWorkMoneyAmount(value, currency);
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

export function formatWorkTshirtEstimatePair(
  loggedHours: number,
  size: WorkTshirtSize | null,
  opts?: {
    showPrice?: boolean;
    price?: number | null;
    currency?: BillingCurrency;
  }
): string {
  const logged = formatWorkHours(loggedHours);
  if (size == null) return logged;
  const sizeLabel = formatWorkTshirtSize(size);
  if (opts?.showPrice && opts.price != null) {
    return `${logged} · ${sizeLabel} · ${formatWorkMoneyAmount(
      opts.price,
      opts.currency ?? DEFAULT_BILLING_CURRENCY
    )}`;
  }
  return `${logged} · ${sizeLabel}`;
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
    estimateSize?: WorkTshirtSize | null;
    fixedPriceEnabled?: boolean;
    sizePrice?: number | null;
  }
): string | null {
  const currency = opts.currency ?? DEFAULT_BILLING_CURRENCY;
  if (opts.estimateUnit === "tshirt") {
    const size = opts.estimateSize ?? null;
    if (opts.showReportedTime && opts.showEstimates) {
      return formatWorkTshirtEstimatePair(loggedHours, size, {
        showPrice: opts.fixedPriceEnabled === true,
        price: opts.sizePrice,
        currency,
      });
    }
    if (opts.showReportedTime) return formatWorkHours(loggedHours);
    if (opts.showEstimates) {
      if (size == null) return null;
      if (opts.fixedPriceEnabled && opts.sizePrice != null) {
        return `${formatWorkTshirtSize(size)} · ${formatWorkMoneyAmount(
          opts.sizePrice,
          currency
        )}`;
      }
      return formatWorkTshirtSize(size);
    }
    return null;
  }
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
  if (unit === "tshirt") {
    return {
      ok: false,
      message: "Use a t-shirt size (XS–XL) instead of a numeric estimate.",
    };
  }
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
  if (value > WORK_ESTIMATE_CURRENCY_MAX) {
    return { ok: false, message: estimateParseError(unit) };
  }
  return { ok: true, value: Math.round(value * 100) / 100 };
}

export function parseWorkEstimateSizeValue(
  raw: string
):
  | { ok: true; value: WorkTshirtSize | null }
  | { ok: false; message: string } {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return { ok: true, value: null };
  if (!isWorkTshirtSize(trimmed)) {
    return {
      ok: false,
      message: "Size must be XS, S, M, L, or XL.",
    };
  }
  return { ok: true, value: trimmed };
}

export function estimateParseError(unit: WorkEstimateUnit): string {
  if (unit === "hours") {
    return `Estimate must be between 0 and ${WORK_ESTIMATE_HOURS_MAX} hours.`;
  }
  if (unit === "tshirt") {
    return "Size must be XS, S, M, L, or XL.";
  }
  return `Estimate must be between 0 and ${WORK_ESTIMATE_CURRENCY_MAX}.`;
}

/** Whether logged time can be compared to estimate (same unit). */
export function workEstimateComparesToLogged(
  unit: WorkEstimateUnit
): boolean {
  return unit === "hours";
}

/** Scope approval (lock size + scope) is only for fixed-price t-shirt boards. */
export function workScopeApprovalEnabled(input: {
  estimateUnit: WorkEstimateUnit;
  fixedPriceEnabled: boolean;
}): boolean {
  return input.estimateUnit === "tshirt" && input.fixedPriceEnabled;
}

export type WorkSizePriceMap = Partial<Record<WorkTshirtSize, number>>;

export function resolveSizePrice(
  size: WorkTshirtSize | null | undefined,
  prices: WorkSizePriceMap | null | undefined
): number | null {
  if (size == null || prices == null) return null;
  const amount = prices[size];
  return amount == null || !Number.isFinite(amount) ? null : amount;
}

export function sumFixedSizePrices(
  sizes: Array<WorkTshirtSize | null | undefined>,
  prices: WorkSizePriceMap | null | undefined
): number | null {
  if (prices == null) return null;
  let sum = 0;
  let any = false;
  for (const size of sizes) {
    const amount = resolveSizePrice(size, prices);
    if (amount == null) continue;
    sum += amount;
    any = true;
  }
  return any ? Math.round(sum * 100) / 100 : null;
}
