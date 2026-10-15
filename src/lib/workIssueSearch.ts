import "server-only";

import { createHash } from "node:crypto";
import type { WorkActor } from "@/lib/workAccess";
import { listAccessibleWorkProjects } from "@/lib/workBoards";
import { fetchWorkBoardStatuses } from "@/lib/workBoardsQueries";
import { WorkInputError } from "@/lib/workErrors";
import { workIssueKey, workPersonFromUser } from "@/lib/workIssueKey";
import { fetchWorkIssuePage, type WorkIssuePagePosition } from "@/lib/workIssueSearchQueries";
import { fetchIssueAssignees, fetchIssueLabels } from "@/lib/workIssuesQueries";
import type { WorkIssueListInput, WorkIssueListPage, WorkLabel, WorkPerson } from "@/lib/workTypes";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isSqlInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= -2147483648 && value <= 2147483647;
}

function decodeCursor(raw: string, scope: string): WorkIssuePagePosition {
  try {
    if (raw.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error();

    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));

    if (typeof parsed !== "object" || parsed === null) throw new Error();

    const cursor = parsed as Record<string, unknown>;

    if (
      typeof cursor.projectId !== "string" || !uuidPattern.test(cursor.projectId) ||
      typeof cursor.columnId !== "string" || !uuidPattern.test(cursor.columnId) ||
      !isSqlInteger(cursor.number) || cursor.number < 1 ||
      !isSqlInteger(cursor.sortOrder) || !isSqlInteger(cursor.columnSortOrder) ||
      !isSqlInteger(cursor.priorityRank) || cursor.priorityRank < 0 || cursor.priorityRank > 3 ||
      cursor.scope !== scope
    ) {
      throw new Error();
    }

    return {
      projectId: cursor.projectId, number: cursor.number, columnId: cursor.columnId,
      columnSortOrder: cursor.columnSortOrder, sortOrder: cursor.sortOrder, priorityRank: cursor.priorityRank,
    };
  } catch {
    throw new WorkInputError("Invalid cursor. Use nextCursor with the same issue filters and sorting.");
  }
}

export async function listWorkIssues(actor: WorkActor, input: WorkIssueListInput): Promise<WorkIssueListPage> {
  const limit = input.limit ?? 50;

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new WorkInputError("Limit must be between 1 and 100.");

  if (input.columnId && !input.projectId) throw new WorkInputError("Project ID is required when filtering by column.");

  const assignedToMe = input.assignedToMe ?? true;
  const sortBy = input.sortBy ?? "number";

  if (!["number", "boardOrder", "priority"].includes(sortBy)) throw new WorkInputError("Invalid issue sorting.");
  if (input.isDone !== undefined && typeof input.isDone !== "boolean") throw new WorkInputError("isDone must be a boolean.");
  if (input.priority !== undefined && input.priority !== null && !["low", "medium", "high"].includes(input.priority)) {
    throw new WorkInputError("Invalid priority.");
  }
  if (input.labels !== undefined && (!Array.isArray(input.labels) || input.labels.length > 50)) {
    throw new WorkInputError("Labels must be an array of at most 50 names.");
  }

  const labelNames = new Set<string>();

  for (const label of input.labels ?? []) {
    if (typeof label !== "string" || !label.trim() || label.trim().length > 100) {
      throw new WorkInputError("Each label must have 1 to 100 characters.");
    }

    labelNames.add(label.trim().toLowerCase());
  }

  const labels = [...labelNames].sort();

  if (input.query !== undefined && (typeof input.query !== "string" || !input.query.trim() || input.query.length > 500)) {
    throw new WorkInputError("Search query must have 1 to 500 characters.");
  }

  const query = input.query?.trim();
  // Hash the filters to keep cursors bounded even when many label names are supplied.
  const scope = createHash("sha256").update(JSON.stringify([
    actor.id, input.projectId ?? null, input.customerId ?? null, input.columnId ?? null,
    assignedToMe, labels, input.priority === undefined ? "any" : input.priority, input.isDone ?? null, query ?? null, sortBy,
  ])).digest("hex");
  const after = input.cursor ? decodeCursor(input.cursor, scope) : undefined;
  const projects = await listAccessibleWorkProjects(actor, input.customerId);
  const projectIds = projects.filter((project) => !input.projectId || project.id === input.projectId).map((project) => project.id);

  if (input.projectId && projectIds.length === 0) throw new WorkInputError("Project not found or access denied.");

  if (input.columnId && input.projectId) {
    const columns = await fetchWorkBoardStatuses(input.projectId);

    if (!columns.some((column) => column.id === input.columnId)) throw new WorkInputError("Column not found in this project.");
  }

  const rows = await fetchWorkIssuePage({
    projectIds, appUserId: actor.id, assignedToMe, columnId: input.columnId,
    labels, priority: input.priority, isDone: input.isDone, query, sortBy, limit, after,
  });
  const page = rows.slice(0, limit);
  const issueIds = page.map((row) => row.id);
  const [assignees, issueLabels] = await Promise.all([
    fetchIssueAssignees(issueIds),
    fetchIssueLabels(issueIds),
  ]);
  const assigneesByIssue = new Map<string, WorkPerson[]>();
  const labelsByIssue = new Map<string, WorkLabel[]>();

  for (const assignee of assignees) {
    const people = assigneesByIssue.get(assignee.issue_id) ?? [];
    people.push(workPersonFromUser(assignee));
    assigneesByIssue.set(assignee.issue_id, people);
  }

  for (const label of issueLabels) {
    const issueLabels = labelsByIssue.get(label.issue_id) ?? [];
    issueLabels.push({ id: label.id, name: label.name });
    labelsByIssue.set(label.issue_id, issueLabels);
  }

  const last = page.at(-1);

  return {
    issues: page.map((row) => ({
      id: row.id,
      key: workIssueKey(row.project_prefix, row.number),
      title: row.title,
      projectId: row.project_id,
      projectTitle: row.project_title,
      customerId: row.customer_id,
      customerName: row.customer_name,
      columnId: row.column_id,
      columnName: row.column_name,
      isDone: row.is_done,
      sortOrder: row.sort_order,
      issueType: row.issue_type,
      priority: row.priority,
      description: row.description,
      currentState: row.current_state,
      nextStep: row.next_step,
      outOfScope: row.out_of_scope,
      owner: row.owner_id ? workPersonFromUser({ id: row.owner_id, name: row.owner_name, email: row.owner_email ?? "" }) : null,
      assignees: assigneesByIssue.get(row.id) ?? [],
      labels: labelsByIssue.get(row.id) ?? [],
    })),
    nextCursor: rows.length > limit && last
      ? Buffer.from(JSON.stringify({
        projectId: last.project_id, number: last.number, columnId: last.column_id,
        columnSortOrder: last.column_sort_order, sortOrder: last.sort_order, priorityRank: last.priority_rank, scope,
      })).toString("base64url")
      : null,
  };
}
