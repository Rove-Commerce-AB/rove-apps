export const ACTIVITY_TIME_LINK_PREFIX = "activity:";

export function activityLinkKey(projectActivityId: string): string {
  return `${ACTIVITY_TIME_LINK_PREFIX}${projectActivityId}`;
}

export function activityIdFromLinkKey(
  raw: string | null | undefined
): string | null {
  const value = (raw ?? "").trim();
  if (!value.toLowerCase().startsWith(ACTIVITY_TIME_LINK_PREFIX)) return null;
  const id = value.slice(ACTIVITY_TIME_LINK_PREFIX.length).trim();
  return id || null;
}

export function collectActivityIdsFromLinkKeys(
  keys: Array<string | null | undefined>
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    const id = activityIdFromLinkKey(key);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}
