import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { pgDateToDateOnlyOrNull } from "@/lib/pgDateOnly";
import type { WorkIssuePriority, WorkIssueType } from "@/lib/workTypes";

export type WorkMyIssueRow = {
  id: string;
  number: number;
  title: string;
  issue_type: WorkIssueType;
  priority: WorkIssuePriority | null;
  status_id: string;
  status_name: string;
  is_done: boolean;
  status_sort: number;
  customer_id: string;
  customer_name: string;
  customer_color: string | null;
  work_show_estimates_to_customer_users: boolean;
  work_show_reported_time_to_customer_users: boolean;
  billing_currency: string;
  project_id: string;
  project_title: string;
  project_prefix: string;
  estimate_unit: string;
  status_index: number;
  status_count: number;
  sprint_number: number | null;
  sprint_title: string | null;
  estimate_hours: string | number | null;
  due_date: Date | string | null;
  is_owner: boolean;
  is_assignee: boolean;
};

export async function fetchMemberWorkProjectIds(
  appUserId: string
): Promise<string[]> {
  const { rows } = await cloudSqlPool.query<{ id: string }>(
    `SELECT p.id
     FROM work_projects p
     JOIN work_project_members m ON m.project_id = p.id
     WHERE m.app_user_id = $1
       AND p.archived_at IS NULL`,
    [appUserId]
  );
  return rows.map((row) => row.id);
}

export async function fetchMyWorkIssues(
  projectIds: string[],
  appUserId: string
): Promise<WorkMyIssueRow[]> {
  if (projectIds.length === 0) return [];
  const { rows } = await cloudSqlPool.query<WorkMyIssueRow>(
    `SELECT
       i.id,
       i.number,
       i.title,
       i.issue_type,
       i.priority,
       s.id AS status_id,
       s.name AS status_name,
       s.is_done,
       s.sort_order AS status_sort,
       c.id AS customer_id,
       c.name AS customer_name,
       c.color AS customer_color,
       c.work_show_estimates_to_customer_users,
       c.work_show_reported_time_to_customer_users,
       c.billing_currency,
       p.id AS project_id,
       p.title AS project_title,
       p.prefix AS project_prefix,
       COALESCE(p.estimate_unit, 'hours') AS estimate_unit,
       (
         SELECT COUNT(*)::int
         FROM work_project_statuses earlier
         WHERE earlier.project_id = i.project_id
           AND earlier.sort_order < s.sort_order
       ) AS status_index,
       (
         SELECT COUNT(*)::int
         FROM work_project_statuses all_status
         WHERE all_status.project_id = i.project_id
       ) AS status_count,
       sp.number AS sprint_number,
       sp.title AS sprint_title,
       i.estimate_hours,
       i.due_date,
       (i.owner_app_user_id = $2) AS is_owner,
       EXISTS (
         SELECT 1
         FROM work_issue_assignees a
         WHERE a.issue_id = i.id
           AND a.app_user_id = $2
       ) AS is_assignee
     FROM work_issues i
     JOIN work_projects p ON p.id = i.project_id
     JOIN customers c ON c.id = p.customer_id
     JOIN work_project_statuses s
       ON s.project_id = i.project_id
      AND s.id = i.status
     LEFT JOIN work_sprints sp ON sp.id = i.sprint_id
     WHERE i.project_id = ANY($1::uuid[])
       AND (
         i.owner_app_user_id = $2
         OR EXISTS (
           SELECT 1
           FROM work_issue_assignees a
           WHERE a.issue_id = i.id
             AND a.app_user_id = $2
         )
       )
     ORDER BY
       lower(c.name),
       lower(p.title),
       s.sort_order,
       i.sort_order,
       i.number`,
    [projectIds, appUserId]
  );
  return rows.map((row) => ({
    ...row,
    due_date: pgDateToDateOnlyOrNull(row.due_date),
  }));
}
