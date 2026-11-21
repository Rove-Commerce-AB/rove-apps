export const WORK_RELATION_EDGE_KINDS = ["blocks", "relates", "parent"] as const;
export type WorkRelationEdgeKind = (typeof WORK_RELATION_EDGE_KINDS)[number];

export const WORK_RELATION_ROLES = [
  "parent",
  "child",
  "blocks",
  "blocked_by",
  "relates",
] as const;
export type WorkRelationRole = (typeof WORK_RELATION_ROLES)[number];

export type WorkRelationRow = {
  id: string;
  boardId: string;
  fromIssueId: string;
  toIssueId: string;
  kind: WorkRelationEdgeKind;
};

export type WorkRelatedIssue = {
  relationId: string;
  id: string;
  key: string;
  title: string;
  status: string;
  isDone: boolean;
};

export type WorkIssueRelations = {
  parent: WorkRelatedIssue | null;
  children: WorkRelatedIssue[];
  blocks: WorkRelatedIssue[];
  blockedBy: WorkRelatedIssue[];
  relates: WorkRelatedIssue[];
};

export type WorkIssueRelationRef = Omit<WorkRelatedIssue, "relationId">;

export function emptyWorkIssueRelations(): WorkIssueRelations {
  return {
    parent: null,
    children: [],
    blocks: [],
    blockedBy: [],
    relates: [],
  };
}

export function isIssueBlocked(relations: WorkIssueRelations): boolean {
  return relations.blockedBy.some((issue) => !issue.isDone);
}

/** All issue ids linked to this issue (any relation role). */
export function relatedIssueIds(relations: WorkIssueRelations): string[] {
  const ids = new Set<string>();
  if (relations.parent) ids.add(relations.parent.id);
  for (const row of relations.children) ids.add(row.id);
  for (const row of relations.blocks) ids.add(row.id);
  for (const row of relations.blockedBy) ids.add(row.id);
  for (const row of relations.relates) ids.add(row.id);
  return [...ids];
}

export function issueHasRelations(relations: WorkIssueRelations): boolean {
  return relatedIssueIds(relations).length > 0;
}

export function canonicalizeRelatePair(
  a: string,
  b: string
): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function relationEdgeFromRole(
  issueId: string,
  otherId: string,
  role: WorkRelationRole
): { fromIssueId: string; toIssueId: string; kind: WorkRelationEdgeKind } {
  if (role === "parent") {
    return { fromIssueId: otherId, toIssueId: issueId, kind: "parent" };
  }
  if (role === "child") {
    return { fromIssueId: issueId, toIssueId: otherId, kind: "parent" };
  }
  if (role === "blocks") {
    return { fromIssueId: issueId, toIssueId: otherId, kind: "blocks" };
  }
  if (role === "blocked_by") {
    return { fromIssueId: otherId, toIssueId: issueId, kind: "blocks" };
  }
  const [fromIssueId, toIssueId] = canonicalizeRelatePair(issueId, otherId);
  return { fromIssueId, toIssueId, kind: "relates" };
}

export function childAlreadyHasParent(
  rows: readonly WorkRelationRow[],
  childId: string
): boolean {
  return rows.some((row) => row.kind === "parent" && row.toIssueId === childId);
}

export function wouldCreateParentCycle(
  rows: readonly WorkRelationRow[],
  parentId: string,
  childId: string
): boolean {
  const parentOf = new Map<string, string>();
  for (const row of rows) {
    if (row.kind === "parent") parentOf.set(row.toIssueId, row.fromIssueId);
  }
  let current: string | undefined = parentId;
  const seen = new Set<string>();
  while (current) {
    if (current === childId) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    current = parentOf.get(current);
  }
  return false;
}

export function wouldCreateBlocksCycle(
  rows: readonly WorkRelationRow[],
  fromId: string,
  toId: string
): boolean {
  const outgoing = new Map<string, string[]>();
  for (const row of rows) {
    if (row.kind !== "blocks") continue;
    const list = outgoing.get(row.fromIssueId) ?? [];
    list.push(row.toIssueId);
    outgoing.set(row.fromIssueId, list);
  }
  const stack = [toId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === fromId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of outgoing.get(current) ?? []) stack.push(next);
  }
  return false;
}

function sortRelated(issues: WorkRelatedIssue[]) {
  return issues.sort(
    (a, b) => a.key.localeCompare(b.key) || a.title.localeCompare(b.title)
  );
}

export function groupRelationsForIssues(
  issueIds: readonly string[],
  rows: readonly WorkRelationRow[],
  refs: ReadonlyMap<string, WorkIssueRelationRef>
): Map<string, WorkIssueRelations> {
  const grouped = new Map<string, WorkIssueRelations>();
  for (const id of issueIds) {
    grouped.set(id, emptyWorkIssueRelations());
  }

  function attach(
    issueId: string,
    field: Exclude<keyof WorkIssueRelations, "parent">,
    relationId: string,
    otherId: string
  ) {
    const bucket = grouped.get(issueId);
    const other = refs.get(otherId);
    if (!bucket || !other) return;
    bucket[field].push({ relationId, ...other });
  }

  for (const row of rows) {
    const from = refs.get(row.fromIssueId);
    const to = refs.get(row.toIssueId);
    if (!from || !to) continue;
    if (row.kind === "parent") {
      const child = grouped.get(row.toIssueId);
      if (child) child.parent = { relationId: row.id, ...from };
      attach(row.fromIssueId, "children", row.id, row.toIssueId);
      continue;
    }
    if (row.kind === "blocks") {
      attach(row.fromIssueId, "blocks", row.id, row.toIssueId);
      attach(row.toIssueId, "blockedBy", row.id, row.fromIssueId);
      continue;
    }
    attach(row.fromIssueId, "relates", row.id, row.toIssueId);
    attach(row.toIssueId, "relates", row.id, row.fromIssueId);
  }

  for (const bucket of grouped.values()) {
    sortRelated(bucket.children);
    sortRelated(bucket.blocks);
    sortRelated(bucket.blockedBy);
    sortRelated(bucket.relates);
  }
  return grouped;
}

export function relationRoleLabel(role: WorkRelationRole): string {
  if (role === "parent") return "Parent";
  if (role === "child") return "Child";
  if (role === "blocks") return "Blocks";
  if (role === "blocked_by") return "Blocked by";
  return "Relates to";
}

export function relationEventSummary(
  role: WorkRelationRole,
  otherKey: string
): string {
  if (role === "parent") return `set parent to ${otherKey}`;
  if (role === "child") return `added child ${otherKey}`;
  if (role === "blocks") return `marked as blocking ${otherKey}`;
  if (role === "blocked_by") return `marked as blocked by ${otherKey}`;
  return `related to ${otherKey}`;
}
