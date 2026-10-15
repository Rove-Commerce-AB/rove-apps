import type { WorkIssue } from "@/lib/workTypes";

/** Fields commonly updated via optimistic drawer/board patches. */
export type WorkIssueOptimisticPatch = Partial<
  Pick<
    WorkIssue,
    | "title"
    | "description"
    | "currentState"
    | "nextStep"
    | "outOfScope"
    | "priority"
    | "issueType"
    | "component"
    | "estimateHours"
    | "owner"
    | "assignees"
    | "labels"
    | "sprintId"
    | "startDate"
    | "dueDate"
    | "loggedHours"
  >
>;

export type OptimisticIssuePatches = Map<string, WorkIssueOptimisticPatch>;

export function noteOptimisticIssuePatch(
  patches: OptimisticIssuePatches,
  issueId: string,
  patch: WorkIssueOptimisticPatch
): void {
  const prev = patches.get(issueId) ?? {};
  patches.set(issueId, { ...prev, ...patch });
}

export function clearOptimisticIssuePatch(
  patches: OptimisticIssuePatches,
  issueId: string
): void {
  patches.delete(issueId);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== "object" || typeof b !== "object") return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Merge server board issues into local state.
 * Preserves optimistic board position (status/sortOrder) and any fields
 * recorded in `optimisticPatches` until the server payload catches up —
 * so a stale create/refresh cannot wipe an in-flight description edit.
 */
export function mergeIssuesFromServer(
  local: WorkIssue[],
  server: WorkIssue[],
  optimisticPatches?: OptimisticIssuePatches
): WorkIssue[] {
  const localById = new Map(local.map((issue) => [issue.id, issue]));
  return server.map((remote) => {
    const current = localById.get(remote.id);
    if (!current) {
      optimisticPatches?.delete(remote.id);
      return remote;
    }

    const status =
      current.status !== remote.status ? current.status : remote.status;
    const sortOrder =
      current.sortOrder !== remote.sortOrder
        ? current.sortOrder
        : remote.sortOrder;

    const patch = optimisticPatches?.get(remote.id);
    if (!patch || Object.keys(patch).length === 0) {
      return {
        ...remote,
        status,
        sortOrder,
      };
    }

    const remaining: WorkIssueOptimisticPatch = {};
    const overlay: WorkIssueOptimisticPatch = {};
    for (const [key, localValue] of Object.entries(patch) as [
      keyof WorkIssueOptimisticPatch,
      WorkIssueOptimisticPatch[keyof WorkIssueOptimisticPatch],
    ][]) {
      const remoteValue = remote[key];
      if (valuesEqual(localValue, remoteValue)) {
        continue;
      }
      remaining[key] = localValue as never;
      overlay[key] = (current[key] ?? localValue) as never;
    }

    if (Object.keys(remaining).length === 0) {
      optimisticPatches?.delete(remote.id);
    } else {
      optimisticPatches?.set(remote.id, remaining);
    }

    return {
      ...remote,
      ...overlay,
      status,
      sortOrder,
    };
  });
}
