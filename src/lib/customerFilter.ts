/** Shared customer filter helpers (Support now; Work can reuse later). */

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
 * Resolve selected customer for a list page.
 * Precedence: explicit query → persisted cookie → All (null).
 * Invalid ids fall through to the next source.
 */
export function resolveCustomerFilterSelection(args: {
  queryValue: string | null | undefined;
  persistedValue: string | null | undefined;
  allowedIds: ReadonlySet<string> | readonly string[];
}): string | null {
  const allowed = asIdSet(args.allowedIds);

  const fromQuery = normalizeCustomerFilterValue(args.queryValue, allowed);
  if (fromQuery !== undefined) return fromQuery;

  const fromPersisted = normalizeCustomerFilterValue(
    args.persistedValue,
    allowed
  );
  if (fromPersisted !== undefined) return fromPersisted;

  return null;
}

/**
 * Returns:
 * - `null` for All
 * - a customer id when valid
 * - `undefined` when the raw value is missing/invalid (caller should fall through)
 */
export function normalizeCustomerFilterValue(
  raw: string | null | undefined,
  allowedIds: ReadonlySet<string> | readonly string[]
): string | null | undefined {
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === CUSTOMER_FILTER_ALL) return null;
  const allowed = asIdSet(allowedIds);
  if (allowed.has(trimmed)) return trimmed;
  return undefined;
}

export function buildPathWithCustomerFilter(
  basePath: string,
  customerId: string | null,
  queryKey: string = CUSTOMER_FILTER_QUERY_KEY
): string {
  if (!customerId) return basePath;
  const params = new URLSearchParams();
  params.set(queryKey, customerId);
  return `${basePath}?${params.toString()}`;
}

/** Client-side cookie write. Empty value = All. */
export function persistCustomerFilterCookie(
  cookieName: string,
  customerId: string | null,
  maxAge: number = CUSTOMER_FILTER_COOKIE_MAX_AGE
): void {
  if (typeof document === "undefined") return;
  const value = customerId ?? CUSTOMER_FILTER_ALL;
  document.cookie = `${cookieName}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export function shouldHideCustomerFilter(
  customerCount: number,
  hideWhenSingle: boolean
): boolean {
  return hideWhenSingle && customerCount <= 1;
}
