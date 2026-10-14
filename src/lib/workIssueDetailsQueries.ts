import { cloudSqlPool } from "@/lib/cloudSqlPool";
import type { WorkRelationEdgeKind } from "@/lib/workIssueRelations";

export type WorkCommentPosition = { createdAt: string; id: string };

export async function fetchWorkIssueCommentPage(input: {
  projectId: string;
  issueId: string;
  limit: number;
  after?: WorkCommentPosition;
}) {
  const parameters: unknown[] = [input.projectId, input.issueId, input.limit + 1];

  if (input.after) {
    parameters.push(input.after.createdAt, input.after.id);
  }

  const { rows } = await cloudSqlPool.query<{
    id: string;
    body: string;
    created_at: string;
    author_id: string;
    author_name: string | null;
    author_email: string;
  }>(
    `SELECT c.id, c.body,
       to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
       u.id AS author_id, u.name AS author_name, u.email AS author_email
     FROM work_issue_comments c
     JOIN work_issues i ON i.id = c.issue_id AND i.project_id = $1
     JOIN app_users u ON u.id = c.author_app_user_id
     WHERE c.issue_id = $2
       ${input.after ? "AND (c.created_at, c.id) < ($4::timestamptz, $5::uuid)" : ""}
     ORDER BY c.created_at DESC, c.id DESC
     LIMIT $3`,
    parameters
  );

  return rows;
}

export async function fetchWorkIssueRelationDetails(projectId: string, issueId: string) {
  const { rows } = await cloudSqlPool.query<{
    id: string;
    from_issue_id: string;
    to_issue_id: string;
    kind: WorkRelationEdgeKind;
    related_id: string;
    number: number;
    title: string;
    status: string;
    is_done: boolean;
  }>(
    `SELECT r.id, r.from_issue_id, r.to_issue_id, r.kind,
       related.id AS related_id, related.number, related.title, related.status, s.is_done
     FROM work_issue_relations r
     JOIN work_issues related
       ON related.id = CASE WHEN r.from_issue_id = $2 THEN r.to_issue_id ELSE r.from_issue_id END
       AND related.project_id = $1
     JOIN work_project_statuses s ON s.id = related.status AND s.project_id = $1
     WHERE r.project_id = $1 AND (r.from_issue_id = $2 OR r.to_issue_id = $2)
     ORDER BY related.number, r.id`,
    [projectId, issueId]
  );

  return rows;
}
