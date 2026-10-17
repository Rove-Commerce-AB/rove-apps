import type {
  WorkComponent,
  WorkIssue,
  WorkIssuePriority,
  WorkIssueType,
  WorkPerson,
} from "@/lib/workTypes";

export const UNASSIGNED_OWNER_ID = "unassigned";
export const NO_LABEL_ID = "no-label";
export const NO_COMPONENT_ID = "no-component";
export const NO_PRIORITY_ID = "no-priority";

export type WorkBoardPriorityFilterId =
  | WorkIssuePriority
  | typeof NO_PRIORITY_ID;

export type WorkBoardGroupBy =
  | "none"
  | "owner"
  | "label"
  | "component"
  | "priority";

export type WorkBoardIssueFilters = {
  ownerIds: readonly string[];
  typeIds: readonly WorkIssueType[];
  componentIds: readonly string[];
  priorityIds: readonly WorkBoardPriorityFilterId[];
  /** Empty = no sprint filter. Otherwise issue must be in one of these sprints. */
  sprintIds: readonly string[];
};

const PRIORITY_GROUP_ORDER: WorkBoardPriorityFilterId[] = [
  "high",
  "medium",
  "low",
  NO_PRIORITY_ID,
];

export type WorkColumnGroup = {
  key: string;
  title: string;
  owner: WorkPerson | null;
  issues: WorkIssue[];
};

export function ownerFilterKey(issue: WorkIssue): string {
  return issue.owner?.id ?? UNASSIGNED_OWNER_ID;
}

export function componentFilterKey(issue: WorkIssue): string {
  return issue.component?.id ?? NO_COMPONENT_ID;
}

export function priorityFilterKey(issue: WorkIssue): WorkBoardPriorityFilterId {
  return issue.priority ?? NO_PRIORITY_ID;
}

export function issueMatchesOwnerFilter(
  issue: WorkIssue,
  ownerFilterIds: readonly string[]
): boolean {
  if (ownerFilterIds.length === 0) return true;
  return ownerFilterIds.includes(ownerFilterKey(issue));
}

export function issueMatchesTypeFilter(
  issue: WorkIssue,
  typeIds: readonly WorkIssueType[]
): boolean {
  if (typeIds.length === 0) return true;
  return typeIds.includes(issue.issueType);
}

export function issueMatchesComponentFilter(
  issue: WorkIssue,
  componentIds: readonly string[]
): boolean {
  if (componentIds.length === 0) return true;
  return componentIds.includes(componentFilterKey(issue));
}

export function issueMatchesPriorityFilter(
  issue: WorkIssue,
  priorityIds: readonly WorkBoardPriorityFilterId[]
): boolean {
  if (priorityIds.length === 0) return true;
  return priorityIds.includes(priorityFilterKey(issue));
}

export function issueMatchesSprintFilter(
  issue: WorkIssue,
  sprintIds: readonly string[]
): boolean {
  if (sprintIds.length === 0) return true;
  return issue.sprintId != null && sprintIds.includes(issue.sprintId);
}

export function issueMatchesBoardFilters(
  issue: WorkIssue,
  filters: WorkBoardIssueFilters
): boolean {
  return (
    issueMatchesOwnerFilter(issue, filters.ownerIds) &&
    issueMatchesTypeFilter(issue, filters.typeIds) &&
    issueMatchesComponentFilter(issue, filters.componentIds) &&
    issueMatchesPriorityFilter(issue, filters.priorityIds) &&
    issueMatchesSprintFilter(issue, filters.sprintIds)
  );
}

export function collectOwnerFilterPeople(
  people: WorkPerson[],
  issues: WorkIssue[]
): WorkPerson[] {
  const byId = new Map(people.map((person) => [person.id, person]));
  for (const issue of issues) {
    if (issue.owner && !byId.has(issue.owner.id)) {
      byId.set(issue.owner.id, issue.owner);
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function collectBoardComponents(
  components: WorkComponent[],
  issues: WorkIssue[]
): WorkComponent[] {
  const byId = new Map(components.map((row) => [row.id, row]));
  for (const issue of issues) {
    if (issue.component && !byId.has(issue.component.id)) {
      byId.set(issue.component.id, issue.component);
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function visibleWorkIssueIds(
  issues: WorkIssue[],
  search: string,
  filters: WorkBoardIssueFilters
): Set<string> {
  const query = search.trim().toLowerCase();
  return new Set(
    issues
      .filter((issue) => {
        if (!issueMatchesBoardFilters(issue, filters)) return false;
        if (!query) return true;
        return (
          issue.title.toLowerCase().includes(query) ||
          issue.key.toLowerCase().includes(query)
        );
      })
      .map((issue) => issue.id)
  );
}

function sortNamedGroups(groups: WorkColumnGroup[], emptyKey: string) {
  return groups.sort((a, b) => {
    if (a.key === emptyKey) return 1;
    if (b.key === emptyKey) return -1;
    return a.title.localeCompare(b.title);
  });
}

export function groupIssuesByOwner(issues: WorkIssue[]): WorkColumnGroup[] {
  const groups = new Map<string, WorkColumnGroup>();
  for (const issue of issues) {
    const key = ownerFilterKey(issue);
    const current = groups.get(key);
    if (current) {
      current.issues.push(issue);
      continue;
    }
    groups.set(key, {
      key,
      title: issue.owner?.name ?? "Unassigned",
      owner: issue.owner,
      issues: [issue],
    });
  }
  return sortNamedGroups([...groups.values()], UNASSIGNED_OWNER_ID);
}

export function groupIssuesByLabel(issues: WorkIssue[]): WorkColumnGroup[] {
  const groups = new Map<string, WorkColumnGroup>();
  function add(key: string, title: string, issue: WorkIssue) {
    const current = groups.get(key);
    if (current) {
      current.issues.push(issue);
      return;
    }
    groups.set(key, { key, title, owner: null, issues: [issue] });
  }
  for (const issue of issues) {
    if (issue.labels.length === 0) {
      add(NO_LABEL_ID, "No labels", issue);
      continue;
    }
    for (const label of issue.labels) {
      add(label.id, label.name, issue);
    }
  }
  return sortNamedGroups([...groups.values()], NO_LABEL_ID);
}

export function groupIssuesByComponent(issues: WorkIssue[]): WorkColumnGroup[] {
  const groups = new Map<string, WorkColumnGroup>();
  for (const issue of issues) {
    const key = componentFilterKey(issue);
    const current = groups.get(key);
    if (current) {
      current.issues.push(issue);
      continue;
    }
    groups.set(key, {
      key,
      title: issue.component?.name ?? "No component",
      owner: null,
      issues: [issue],
    });
  }
  return sortNamedGroups([...groups.values()], NO_COMPONENT_ID);
}

export function groupIssuesByPriority(issues: WorkIssue[]): WorkColumnGroup[] {
  const groups = new Map<string, WorkColumnGroup>();
  for (const issue of issues) {
    const key = priorityFilterKey(issue);
    const current = groups.get(key);
    if (current) {
      current.issues.push(issue);
      continue;
    }
    groups.set(key, {
      key,
      title: workIssuePriorityLabel(issue.priority),
      owner: null,
      issues: [issue],
    });
  }
  return [...groups.values()].sort((a, b) => {
    return (
      PRIORITY_GROUP_ORDER.indexOf(a.key as WorkBoardPriorityFilterId) -
      PRIORITY_GROUP_ORDER.indexOf(b.key as WorkBoardPriorityFilterId)
    );
  });
}

export function columnIssueGroups(
  issues: WorkIssue[],
  groupBy: WorkBoardGroupBy
): WorkColumnGroup[] {
  if (groupBy === "owner") return groupIssuesByOwner(issues);
  if (groupBy === "label") return groupIssuesByLabel(issues);
  if (groupBy === "component") return groupIssuesByComponent(issues);
  if (groupBy === "priority") return groupIssuesByPriority(issues);
  return [{ key: "all", title: "", owner: null, issues }];
}

export function groupByTriggerLabel(groupBy: WorkBoardGroupBy): string {
  if (groupBy === "owner") return "Owner";
  if (groupBy === "label") return "Label";
  if (groupBy === "component") return "Component";
  if (groupBy === "priority") return "Priority";
  return "Group";
}

export function workIssueTypeLabel(type: WorkIssueType): string {
  return type === "bug" ? "Bug" : "Issue";
}

export function workIssuePriorityLabel(
  priority: WorkIssuePriority | null
): string {
  if (priority === "high") return "High";
  if (priority === "medium") return "Medium";
  if (priority === "low") return "Low";
  return "No priority";
}

export type WorkColumnSortBy =
  | "priority"
  | "key"
  | "title"
  | "estimate"
  | "owner"
  | "created"
  | "updated";

export function workColumnSortLabel(sortBy: WorkColumnSortBy): string {
  if (sortBy === "priority") return "Priority";
  if (sortBy === "key") return "Key";
  if (sortBy === "title") return "Title";
  if (sortBy === "estimate") return "Estimate";
  if (sortBy === "owner") return "Owner";
  if (sortBy === "created") return "Created";
  return "Updated";
}

function prioritySortRank(priority: WorkIssuePriority | null): number {
  if (priority === "high") return 0;
  if (priority === "medium") return 1;
  if (priority === "low") return 2;
  return 3;
}

/** Stable sort of column issues for persisting a new board order. */
export function sortWorkIssuesForColumn(
  issues: readonly WorkIssue[],
  sortBy: WorkColumnSortBy
): WorkIssue[] {
  return issues.slice().sort((a, b) => {
    if (sortBy === "priority") {
      const byPriority =
        prioritySortRank(a.priority) - prioritySortRank(b.priority);
      if (byPriority !== 0) return byPriority;
    } else if (sortBy === "key") {
      const byNumber = a.number - b.number;
      if (byNumber !== 0) return byNumber;
    } else if (sortBy === "title") {
      const byTitle = a.title.localeCompare(b.title, undefined, {
        sensitivity: "base",
      });
      if (byTitle !== 0) return byTitle;
    } else if (sortBy === "estimate") {
      const aEst = a.estimateHours;
      const bEst = b.estimateHours;
      if (aEst == null && bEst != null) return 1;
      if (aEst != null && bEst == null) return -1;
      if (aEst != null && bEst != null && aEst !== bEst) {
        return bEst - aEst;
      }
    } else if (sortBy === "owner") {
      const aName = a.owner?.name ?? "";
      const bName = b.owner?.name ?? "";
      if (!aName && bName) return 1;
      if (aName && !bName) return -1;
      const byOwner = aName.localeCompare(bName, undefined, {
        sensitivity: "base",
      });
      if (byOwner !== 0) return byOwner;
    } else if (sortBy === "created") {
      const byCreated = b.createdAt.localeCompare(a.createdAt);
      if (byCreated !== 0) return byCreated;
    } else if (sortBy === "updated") {
      const byUpdated = b.updatedAt.localeCompare(a.updatedAt);
      if (byUpdated !== 0) return byUpdated;
    }
    return a.number - b.number || a.sortOrder - b.sortOrder;
  });
}
