/**
 * Natural compare for issue keys like `ATRAC-1`, `ATRAC-10`, `SUP-2`.
 * Prefix first (case-insensitive), then numeric suffix ascending.
 */
export function compareIssueKey(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function sortByIssueKey<T>(
  items: T[],
  keyOf: (item: T) => string
): T[] {
  return [...items].sort((x, y) => compareIssueKey(keyOf(x), keyOf(y)));
}
