/** Shared customer filter helpers (Support now; Work can reuse later). */

import {
  formatIdListParam,
  parseIdListParam,
} from "@/lib/idListFilter";

export const CUSTOMER_FILTER_QUERY_KEY = "customer";

/** Cookie used by Support Monitors ↔ Incidents (not Overview). */
export const SUPPORT_CUSTOMER_FILTER_COOKIE = "rove-support-customer";

export const CUSTOMER_FILTER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/** Query/cookie sentinel meaning “all customers”. */
export const CUSTOMER_FILTER_ALL = "all";

export type CustomerFilterOption = {
  id: string;
  name: string;
};

function asIdSet(
  allowedIds: ReadonlySet<string> | readonly string[]
): ReadonlySet<string> {
  return allowedIds instanceof Set ? allowedIds : new Set(allowedIds);
}

/**
 * Resolve selected customers for a list page.
 * Precedence: explicit query → persisted cookie → All ([]).
 * Invalid ids are dropped; fully invalid values fall through.
 */
export function resolveCustomerFilterSelection(args: {
  queryValue: string | null | undefined;
  persistedValue: string | null | undefined;
  allowedIds: ReadonlySet<string> | readonly string[];
}): string[] {
  const allowed = asIdSet(args.allowedIds);

  const fromQuery = normalizeCustomerFilterValues(args.queryValue, allowed);
  if (fromQuery !== undefined) return fromQuery;

  const fromPersisted = normalizeCustomerFilterValues(
    args.persistedValue,
    allowed
  );
  if (fromPersisted !== undefined) return fromPersisted;

  return [];
}

/**
 * Returns:
 * - `[]` for All
 * - selected ids when at least one is valid
 * - `undefined` when the raw value is missing/invalid (caller should fall through)
 */
export function normalizeCustomerFilterValues(
  raw: string | null | undefined,
  allowedIds: ReadonlySet<string> | readonly string[]
): string[] | undefined {
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === CUSTOMER_FILTER_ALL) return [];
  const parsed = parseIdListParam(trimmed, allowedIds);
  // Fully invalid CSV (e.g. unknown ids only) → fall through.
  if (parsed.length === 0 && trimmed.includes(",")) return undefined;
  if (parsed.length === 0) {
    // Single unknown id → fall through (legacy behavior).
    return undefined;
  }
  return parsed;
}

/** @deprecated Prefer normalizeCustomerFilterValues for multi-select. */
export function normalizeCustomerFilterValue(
  raw: string | null | undefined,
  allowedIds: ReadonlySet<string> | readonly string[]
): string | null | undefined {
  const multi = normalizeCustomerFilterValues(raw, allowedIds);
  if (multi === undefined) return undefined;
  if (multi.length === 0) return null;
  return multi[0] ?? null;
}

export function buildPathWithCustomerFilter(
  basePath: string,
  customerIds: string[] | string | null,
  queryKey: string = CUSTOMER_FILTER_QUERY_KEY
): string {
  const ids = Array.isArray(customerIds)
    ? customerIds
    : customerIds
      ? [customerIds]
      : [];
  const encoded = formatIdListParam(ids);
  if (!encoded) return basePath;
  const params = new URLSearchParams();
  params.set(queryKey, encoded);
  return `${basePath}?${params.toString()}`;
}

/** Client-side cookie write. Empty value = All. */
export function persistCustomerFilterCookie(
  cookieName: string,
  customerIds: string[] | string | null,
  maxAge: number = CUSTOMER_FILTER_COOKIE_MAX_AGE
): void {
  if (typeof document === "undefined") return;
  const ids = Array.isArray(customerIds)
    ? customerIds
    : customerIds
      ? [customerIds]
      : [];
  const value = formatIdListParam(ids) ?? CUSTOMER_FILTER_ALL;
  document.cookie = `${cookieName}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export function shouldHideCustomerFilter(
  customerCount: number,
  hideWhenSingle: boolean
): boolean {
  return hideWhenSingle && customerCount <= 1;
}
