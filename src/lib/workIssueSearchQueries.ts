import { cloudSqlPool } from "@/lib/cloudSqlPool";
import type { WorkIssueListInput, WorkIssuePriority, WorkIssueType } from "@/lib/workTypes";

export type WorkIssuePagePosition = {
  projectId: string;
  number: number;
  columnSortOrder: number;
  columnId: string;
  sortOrder: number;
  priorityRank: number;
};

export type WorkIssueListRow = {
  id: string;
  number: number;
  title: string;
  project_id: string;
  project_title: string;
  project_prefix: string;
  customer_id: string;
  customer_name: string;
  column_id: string;
  column_name: string;
  column_sort_order: number;
  is_done: boolean;
  sort_order: number;
  issue_type: WorkIssueType;
  priority: WorkIssuePriority | null;
  priority_rank: number;
  description: string;
  current_state: string;
  next_step: string;
  out_of_scope: string;
  owner_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
};

const priorityRankSql = "CASE i.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END";

export async function fetchWorkIssuePage(input: {
  projectIds: string[];
  appUserId: string;
  assignedToMe: boolean;
  columnId?: string;
  labels: string[];
  priority?: WorkIssuePriority | null;
  isDone?: boolean;
  query?: string;
  sortBy: NonNullable<WorkIssueListInput["sortBy"]>;
  limit: number;
  after?: WorkIssuePagePosition;
}): Promise<WorkIssueListRow[]> {
  if (input.projectIds.length === 0) return [];

  const parameters: unknown[] = [
    input.projectIds, input.appUserId, input.limit + 1, input.assignedToMe, input.columnId ?? null,
    input.labels.length > 0 ? input.labels : null, input.isDone ?? null,
    input.priority !== undefined, input.priority ?? null, input.query ?? null,
  ];
  // Both the order expressions and parameter casts come from these fixed choices.
  let sortColumns = ["i.project_id", "i.number"];
  let cursorTypes = ["uuid", "int"];
  let cursorValues: unknown[] = input.after ? [input.after.projectId, input.after.number] : [];

  if (input.sortBy === "boardOrder") {
    sortColumns = ["i.project_id", "s.sort_order", "s.id", "i.sort_order", "i.number"];
    cursorTypes = ["uuid", "int", "uuid", "int", "int"];
    cursorValues = input.after
      ? [input.after.projectId, input.after.columnSortOrder, input.after.columnId, input.after.sortOrder, input.after.number] : [];
  } else if (input.sortBy === "priority") {
    sortColumns = [priorityRankSql, "i.project_id", "i.number"];
    cursorTypes = ["int", "uuid", "int"];
    cursorValues = input.after ? [input.after.priorityRank, input.after.projectId, input.after.number] : [];
  }

  const cursorParameters = cursorValues.map((value, index) => {
    parameters.push(value);

    return `$${parameters.length}::${cursorTypes[index]}`;
  });
  const orderBy = sortColumns.join(", ");

  const { rows } = await cloudSqlPool.query<WorkIssueListRow>(
    `SELECT i.id, i.number, i.title, i.project_id, p.title AS project_title, p.prefix AS project_prefix,
       c.id AS customer_id, c.name AS customer_name,
       s.id AS column_id, s.name AS column_name, s.sort_order AS column_sort_order, s.is_done, i.sort_order,
       i.issue_type, i.priority, ${priorityRankSql} AS priority_rank,
       i.description, i.current_state, i.next_step, i.out_of_scope,
       o.id AS owner_id, o.name AS owner_name, o.email AS owner_email
     FROM work_issues i
     JOIN work_projects p ON p.id = i.project_id AND p.archived_at IS NULL
     JOIN customers c ON c.id = p.customer_id AND c.is_active = true
     JOIN work_project_statuses s ON s.project_id = i.project_id AND s.id = i.status
     LEFT JOIN app_users o ON o.id = i.owner_app_user_id
     WHERE i.project_id = ANY($1::uuid[])
       AND ($4::boolean = false OR i.owner_app_user_id = $2::uuid OR EXISTS (
         SELECT 1 FROM work_issue_assignees a WHERE a.issue_id = i.id AND a.app_user_id = $2::uuid
       ))
       AND ($5::uuid IS NULL OR i.status = $5::uuid)
       AND ($6::text[] IS NULL OR NOT EXISTS (
         SELECT 1 FROM unnest($6::text[]) AS wanted(name)
         WHERE NOT EXISTS (
           SELECT 1 FROM work_issue_label_links link
           JOIN work_issue_labels label ON label.id = link.label_id AND label.project_id = i.project_id
           WHERE link.issue_id = i.id AND lower(label.name) = wanted.name
         )
       ))
       AND ($7::boolean IS NULL OR s.is_done = $7::boolean)
       AND ($8::boolean = false OR i.priority IS NOT DISTINCT FROM $9::text)
       AND ($10::text IS NULL OR strpos(lower(concat_ws(' ', p.prefix || '-' || i.number::text,
         i.title, i.description, i.current_state, i.next_step, i.out_of_scope)), lower($10::text)) > 0)
       ${input.after ? `AND (${orderBy}) > (${cursorParameters.join(", ")})` : ""}
     ORDER BY ${orderBy}
     LIMIT $3`,
    parameters
  );

  return rows;
}
