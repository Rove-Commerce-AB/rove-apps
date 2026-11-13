/** Shared helpers for multi-select id filters (empty = no restriction / All). */

/** Toggle an id in a multi-select list. */
export function toggleIdInList(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
}

/**
 * Parse a comma-separated id list from a query/cookie value.
 * Empty / missing / "all" → [].
 * Unknown ids are dropped when `allowedIds` is provided.
 */
export function parseIdListParam(
  raw: string | null | undefined,
  allowedIds?: ReadonlySet<string> | readonly string[]
): string[] {
  if (raw == null) return [];
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "all") return [];
  const parts = trimmed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!allowedIds) return uniqueStable(parts);
  const allowed =
    allowedIds instanceof Set ? allowedIds : new Set(allowedIds);
  return uniqueStable(parts.filter((id) => allowed.has(id)));
}

/** Serialize ids for URL/cookie. Empty → null (omit / treat as All). */
export function formatIdListParam(ids: readonly string[]): string | null {
  if (ids.length === 0) return null;
  return uniqueStable(ids).join(",");
}

function uniqueStable(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** True when a row value matches a multi filter (empty filter = all). */
export function matchesIdListFilter(
  filterIds: readonly string[],
  value: string | null | undefined
): boolean {
  if (filterIds.length === 0) return true;
  if (value == null || value === "") return false;
  return filterIds.includes(value);
}
