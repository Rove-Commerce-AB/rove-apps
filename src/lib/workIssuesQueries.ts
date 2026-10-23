import { cloudSqlPool, withCloudSqlTransaction } from "@/lib/cloudSqlPool";
import type { PoolClient } from "pg";
import type { WorkIssueStatus } from "@/lib/workStatuses";
import type { WorkIssueDetailsInput, WorkLabel } from "@/lib/workTypes";

export type WorkUserRow = {
  id: string;
  name: string | null;
  email: string;
};

export type WorkIssueRow = {
  id: string;
  project_id: string;
  number: number;
  title: string;
  status: WorkIssueStatus;
  sort_order: number;
  issue_type: "issue" | "bug";
  component_id: string | null;
  component_name: string | null;
  description: string;
  current_state: string;
  next_step: string;
  out_of_scope: string;
  priority: "low" | "medium" | "high" | null;
  owner_app_user_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  created_by_app_user_id: string | null;
  reporter_name: string | null;
  reporter_email: string | null;
  estimate_hours: string | number | null;
  sprint_id: string | null;
  start_date: Date | string | null;
  due_date: Date | string | null;
  hidden_from_board_at: Date | string | null;
  created_at: Date;
  updated_at: Date;
};

export async function fetchWorkPeopleForCustomer(
  customerId: string
): Promise<WorkUserRow[]> {
  const { rows } = await cloudSqlPool.query<WorkUserRow>(
    `SELECT u.id, u.name, u.email
     FROM app_users u
     WHERE u.id IN (
       SELECT c.app_user_id
       FROM customer_consultants cc
       JOIN consultants c ON c.id = cc.consultant_id
       WHERE cc.customer_id = $1
         AND c.app_user_id IS NOT NULL
       UNION
       SELECT cau.app_user_id
       FROM customer_app_users cau
       WHERE cau.customer_id = $1
     )
     ORDER BY lower(COALESCE(NULLIF(trim(u.name), ''), u.email))`,
    [customerId]
  );
  return rows;
}

export type WorkAccessPickerRow = WorkUserRow & {
  on_customer: boolean;
};

/**
 * Access picker: people linked to this customer first (incl. that customer's
 * customer-role users only — never other customers' users), then other
 * internal Work-capable users (admins / consultants).
 */
export async function fetchWorkAccessPickerPeople(
  customerId: string
): Promise<WorkAccessPickerRow[]> {
  const { rows } = await cloudSqlPool.query<WorkAccessPickerRow>(
    `WITH customer_people AS (
       SELECT c.app_user_id AS id
       FROM customer_consultants cc
       JOIN consultants c ON c.id = cc.consultant_id
       WHERE cc.customer_id = $1
         AND c.app_user_id IS NOT NULL
       UNION
       SELECT cau.app_user_id
       FROM customer_app_users cau
       WHERE cau.customer_id = $1
     ),
     candidates AS (
       SELECT DISTINCT u.id, u.name, u.email
       FROM app_users u
       WHERE u.role <> 'customer'
         AND (
           u.role = 'admin'
           OR EXISTS (
             SELECT 1 FROM consultants c WHERE c.app_user_id = u.id
           )
         )
       UNION
       SELECT u.id, u.name, u.email
       FROM app_users u
       INNER JOIN customer_people cp ON cp.id = u.id
       WHERE u.role = 'customer'
     )
     SELECT
       c.id,
       c.name,
       c.email,
       EXISTS (SELECT 1 FROM customer_people cp WHERE cp.id = c.id) AS on_customer
     FROM candidates c
     ORDER BY
       EXISTS (SELECT 1 FROM customer_people cp WHERE cp.id = c.id) DESC,
       lower(COALESCE(NULLIF(trim(c.name), ''), c.email))`,
    [customerId]
  );
  return rows;
}

export async function fetchWorkUserById(
  appUserId: string
): Promise<WorkUserRow | null> {
  const { rows } = await cloudSqlPool.query<WorkUserRow>(
    `SELECT u.id, u.name, u.email
     FROM app_users u
     WHERE u.id = $1
       AND u.role <> 'customer'
       AND (
         u.role = 'admin'
         OR EXISTS (
           SELECT 1 FROM consultants c WHERE c.app_user_id = u.id
         )
       )`,
    [appUserId]
  );
  return rows[0] ?? null;
}

export async function fetchWorkAssigneesForCustomer(
  customerId: string,
  boardId: string
): Promise<WorkUserRow[]> {
  const { rows } = await cloudSqlPool.query<WorkUserRow>(
    `SELECT u.id, u.name, u.email
     FROM app_users u
     WHERE u.id IN (
       SELECT c.app_user_id
       FROM customer_consultants cc
       JOIN consultants c ON c.id = cc.consultant_id
       WHERE cc.customer_id = $1
         AND c.app_user_id IS NOT NULL
       UNION
       SELECT cau.app_user_id
       FROM customer_app_users cau
       WHERE cau.customer_id = $1
       UNION
       SELECT m.app_user_id
       FROM work_project_members m
       WHERE m.project_id = $2
     )
     ORDER BY lower(COALESCE(NULLIF(trim(u.name), ''), u.email))`,
    [customerId, boardId]
  );
  return rows;
}

export async function fetchWorkBoardMembers(
  boardId: string
): Promise<WorkUserRow[]> {
  const { rows } = await cloudSqlPool.query<WorkUserRow>(
    `SELECT u.id, u.name, u.email
     FROM work_project_members m
     JOIN app_users u ON u.id = m.app_user_id
     WHERE m.project_id = $1
     ORDER BY m.created_at, lower(COALESCE(NULLIF(trim(u.name), ''), u.email))`,
    [boardId]
  );
  return rows;
}

export async function isWorkBoardMember(
  boardId: string,
  appUserId: string
): Promise<boolean> {
  const { rows } = await cloudSqlPool.query<{ ok: number }>(
    `SELECT 1 AS ok
     FROM work_project_members
     WHERE project_id = $1 AND app_user_id = $2
     LIMIT 1`,
    [boardId, appUserId]
  );
  return rows.length > 0;
}

export async function fetchWorkIssuesForBoard(
  boardId: string,
  issue?: { id: string } | { number: number }
): Promise<WorkIssueRow[]> {
  const { rows } = await cloudSqlPool.query<WorkIssueRow>(
    `SELECT
       i.id,
       i.project_id,
       i.number,
       i.title,
       i.status,
       i.sort_order,
       i.issue_type,
       i.component_id,
       c.name AS component_name,
       i.description,
       i.current_state,
       i.next_step,
       i.out_of_scope,
       i.priority,
       i.owner_app_user_id,
       o.name AS owner_name,
       o.email AS owner_email,
       i.created_by_app_user_id,
       r.name AS reporter_name,
       r.email AS reporter_email,
       i.estimate_hours,
       i.sprint_id,
       i.start_date,
       i.due_date,
       i.hidden_from_board_at,
       i.created_at,
       i.updated_at
     FROM work_issues i
     LEFT JOIN work_components c ON c.id = i.component_id
     LEFT JOIN app_users r ON r.id = i.created_by_app_user_id
     LEFT JOIN app_users o ON o.id = i.owner_app_user_id
     WHERE i.project_id = $1
       ${issue ? ("id" in issue ? "AND i.id = $2::uuid" : "AND i.number = $2::int") : ""}
     ORDER BY i.status, i.sort_order, i.number`,
    issue ? [boardId, "id" in issue ? issue.id : issue.number] : [boardId]
  );
  return rows;
}

export async function fetchIssueAssignees(issueIds: string[]) {
  if (issueIds.length === 0) return [];
  const { rows } = await cloudSqlPool.query<{
    issue_id: string;
    id: string;
    name: string | null;
    email: string;
  }>(
    `SELECT a.issue_id, u.id, u.name, u.email
     FROM work_issue_assignees a
     JOIN app_users u ON u.id = a.app_user_id
     WHERE a.issue_id = ANY($1::uuid[])
     ORDER BY a.created_at ASC, a.app_user_id`,
    [issueIds]
  );
  return rows;
}

export async function fetchIssueLabels(issueIds: string[]) {
  if (issueIds.length === 0) return [];
  const { rows } = await cloudSqlPool.query<{
    issue_id: string;
    id: string;
    name: string;
  }>(
    `SELECT l.issue_id, lab.id, lab.name
     FROM work_issue_label_links l
     JOIN work_issue_labels lab ON lab.id = l.label_id
     WHERE l.issue_id = ANY($1::uuid[])
     ORDER BY lower(lab.name)`,
    [issueIds]
  );
  return rows;
}

export async function fetchBoardLabels(boardId: string) {
  const { rows } = await cloudSqlPool.query<{ id: string; name: string }>(
    `SELECT id, name
     FROM work_issue_labels
     WHERE project_id = $1
     ORDER BY lower(name)`,
    [boardId]
  );
  return rows;
}

export async function fetchIssueComments(issueIds: string[]) {
  if (issueIds.length === 0) return [];
  const { rows } = await cloudSqlPool.query<{
    id: string;
    issue_id: string;
    body: string;
    created_at: Date;
    author_id: string;
    author_name: string | null;
    author_email: string;
  }>(
    `SELECT
       c.id,
       c.issue_id,
       c.body,
       c.created_at,
       u.id AS author_id,
       u.name AS author_name,
       u.email AS author_email
     FROM work_issue_comments c
     JOIN app_users u ON u.id = c.author_app_user_id
     WHERE c.issue_id = ANY($1::uuid[])
     ORDER BY c.created_at DESC`,
    [issueIds]
  );
  return rows;
}

export async function fetchIssueEvents(issueIds: string[]) {
  if (issueIds.length === 0) return [];
  const { rows } = await cloudSqlPool.query<{
    id: string;
    issue_id: string;
    kind: string;
    summary: string;
    created_at: Date;
    actor_id: string;
    actor_name: string | null;
    actor_email: string;
  }>(
    `SELECT
       e.id,
       e.issue_id,
       e.kind,
       e.summary,
       e.created_at,
       u.id AS actor_id,
       u.name AS actor_name,
       u.email AS actor_email
     FROM work_issue_events e
     JOIN app_users u ON u.id = e.actor_app_user_id
     WHERE e.issue_id = ANY($1::uuid[])
     ORDER BY e.created_at DESC`,
    [issueIds]
  );
  return rows;
}

export async function fetchIssueFiles(issueIds: string[]) {
  if (issueIds.length === 0) return [];
  const { rows } = await cloudSqlPool.query<{
    id: string;
    issue_id: string;
    file_name: string;
    mime_type: string;
    byte_size: number;
    created_at: Date;
  }>(
    `SELECT id, issue_id, file_name, mime_type, byte_size, created_at
     FROM work_issue_files
     WHERE issue_id = ANY($1::uuid[])
     ORDER BY created_at DESC`,
    [issueIds]
  );
  return rows;
}

export async function insertWorkIssueEvent(input: {
  issueId: string;
  actorAppUserId: string;
  kind: string;
  summary: string;
}, client?: PoolClient): Promise<void> {
  await (client ?? cloudSqlPool).query(
    `INSERT INTO work_issue_events (issue_id, actor_app_user_id, kind, summary)
     VALUES ($1, $2, $3, $4)`,
    [input.issueId, input.actorAppUserId, input.kind, input.summary]
  );
}

export async function insertWorkIssue(input: {
  boardId: string;
  title: string;
  status: WorkIssueStatus;
  createdByAppUserId: string | null;
  /** Defaults to null (no owner). Pass an id to assign an owner on create. */
  ownerAppUserId?: string | null;
  description?: string;
  currentState?: string;
  nextStep?: string;
  outOfScope?: string;
  priority?: "low" | "medium" | "high" | null;
  labels?: string[];
  issueType?: "issue" | "bug";
  componentId?: string | null;
  /** Actor for the created event when reporter is null. */
  eventActorAppUserId?: string | null;
}): Promise<string> {
  return withCloudSqlTransaction("work-create-issue", async (client) => {
    await client.query("SELECT id FROM work_projects WHERE id = $1 FOR UPDATE", [
      input.boardId,
    ]);
    const { rows: numberRows } = await client.query<{ next: number }>(
      `SELECT COALESCE(MAX(number), 0) + 1 AS next
       FROM work_issues
       WHERE project_id = $1`,
      [input.boardId]
    );
    const { rows: orderRows } = await client.query<{ next: number }>(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
       FROM work_issues
       WHERE project_id = $1 AND status = $2`,
      [input.boardId, input.status]
    );
    const ownerAppUserId =
      input.ownerAppUserId === undefined ? null : input.ownerAppUserId;
    const issueType = input.issueType === "bug" ? "bug" : "issue";
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO work_issues (
         project_id, number, title, status, sort_order,
         owner_app_user_id, created_by_app_user_id, description,
         issue_type, component_id, current_state, next_step, out_of_scope, priority
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
      [
        input.boardId,
        numberRows[0]?.next ?? 1,
        input.title,
        input.status,
        orderRows[0]?.next ?? 0,
        ownerAppUserId,
        input.createdByAppUserId,
        input.description ?? "",
        issueType,
        input.componentId ?? null,
        input.currentState ?? "",
        input.nextStep ?? "",
        input.outOfScope ?? "",
        input.priority ?? null,
      ]
    );
    const id = rows[0]?.id;
    if (!id) throw new Error("Failed to create issue");
    const eventActor =
      input.eventActorAppUserId ?? input.createdByAppUserId ?? null;
    if (eventActor) {
      await client.query(
        `INSERT INTO work_issue_events (issue_id, actor_app_user_id, kind, summary)
         VALUES ($1, $2, 'created', 'created the issue')`,
        [id, eventActor]
      );
    }

    if (input.labels !== undefined) {
      await replaceWorkIssueLabels(client, input.boardId, id, input.labels, eventActor);
    }

    return id;
  });
}

const issueDetailColumns = {
  title: "title",
  description: "description",
  currentState: "current_state",
  nextStep: "next_step",
  outOfScope: "out_of_scope",
  issueType: "issue_type",
  priority: "priority",
} as const;

export async function updateWorkIssueDetails(
  boardId: string,
  issueId: string,
  changes: WorkIssueDetailsInput,
  actorAppUserId: string
): Promise<boolean> {
  const fields = (Object.keys(issueDetailColumns) as (keyof typeof issueDetailColumns)[])
    .filter((field) => changes[field] !== undefined);

  if (fields.length === 0 && changes.labels === undefined) return false;

  return withCloudSqlTransaction("work-edit-issue", async (client) => {
    if (changes.labels !== undefined) {
      // Match creation's lock order and serialize label replacement within the project.
      await client.query("SELECT id FROM work_projects WHERE id = $1 FOR UPDATE", [boardId]);
    }

    // Column names come only from this fixed mapping. Values remain parameters.
    const assignments = fields.map((field, index) => `${issueDetailColumns[field]} = $${index + 3}`);
    const result = await client.query(
      `UPDATE work_issues SET ${assignments.length > 0 ? assignments.join(", ") : "updated_at = now()"}
       WHERE project_id = $1 AND id = $2`,
      [boardId, issueId, ...fields.map((field) => changes[field])]
    );

    if (result.rowCount !== 1) return false;

    if (changes.labels !== undefined) {
      await replaceWorkIssueLabels(client, boardId, issueId, changes.labels, actorAppUserId);
    }

    for (const field of fields) {
      const column = issueDetailColumns[field];
      await client.query(
        `INSERT INTO work_issue_events (issue_id, actor_app_user_id, kind, summary)
         VALUES ($1, $2, $3, $4)`,
        [issueId, actorAppUserId, field === "issueType" ? "type" : column, `updated ${column.replaceAll("_", " ")}`]
      );
    }

    return true;
  });
}

export async function updateWorkIssueTitle(
  boardId: string,
  issueId: string,
  title: string
): Promise<boolean> {
  const result = await cloudSqlPool.query(
    `UPDATE work_issues SET title = $3 WHERE id = $2 AND project_id = $1`,
    [boardId, issueId, title]
  );
  return (result.rowCount ?? 0) === 1;
}

export async function updateWorkIssueOwner(
  boardId: string,
  issueId: string,
  ownerAppUserId: string | null
): Promise<boolean> {
  const result = await cloudSqlPool.query(
    `UPDATE work_issues SET owner_app_user_id = $3 WHERE id = $2 AND project_id = $1`,
    [boardId, issueId, ownerAppUserId]
  );
  return (result.rowCount ?? 0) === 1;
}

export async function updateWorkIssueField(
  boardId: string,
  issueId: string,
  field: "description" | "current_state" | "next_step" | "out_of_scope",
  value: string
): Promise<boolean> {
  const result = await cloudSqlPool.query(
    `UPDATE work_issues SET ${field} = $3 WHERE id = $2 AND project_id = $1`,
    [boardId, issueId, value]
  );
  return (result.rowCount ?? 0) === 1;
}

export async function updateWorkIssueEstimate(
  boardId: string,
  issueId: string,
  estimateHours: number | null
): Promise<boolean> {
  const result = await cloudSqlPool.query(
    `UPDATE work_issues SET estimate_hours = $3 WHERE id = $2 AND project_id = $1`,
    [boardId, issueId, estimateHours]
  );
  return (result.rowCount ?? 0) === 1;
}

export async function updateWorkIssuePriority(
  boardId: string,
  issueId: string,
  priority: "low" | "medium" | "high" | null
): Promise<boolean> {
  const result = await cloudSqlPool.query(
    `UPDATE work_issues SET priority = $3 WHERE id = $2 AND project_id = $1`,
    [boardId, issueId, priority]
  );
  return (result.rowCount ?? 0) === 1;
}

export async function updateWorkIssueType(
  boardId: string,
  issueId: string,
  issueType: "issue" | "bug"
): Promise<boolean> {
  const result = await cloudSqlPool.query(
    `UPDATE work_issues SET issue_type = $3 WHERE id = $2 AND project_id = $1`,
    [boardId, issueId, issueType]
  );
  return (result.rowCount ?? 0) === 1;
}

export async function updateWorkIssueComponent(
  boardId: string,
  issueId: string,
  componentId: string | null
): Promise<boolean> {
  const result = await cloudSqlPool.query(
    `UPDATE work_issues SET component_id = $3 WHERE id = $2 AND project_id = $1`,
    [boardId, issueId, componentId]
  );
  return (result.rowCount ?? 0) === 1;
}

export async function fetchBoardComponents(boardId: string) {
  const { rows } = await cloudSqlPool.query<{ id: string; name: string }>(
    `SELECT id, name
     FROM work_components
     WHERE project_id = $1
     ORDER BY lower(name)`,
    [boardId]
  );
  return rows;
}

export async function findOrCreateBoardComponent(
  boardId: string,
  name: string
): Promise<{ id: string; name: string }> {
  const trimmed = name.trim();
  const { rows: existing } = await cloudSqlPool.query<{
    id: string;
    name: string;
  }>(
    `SELECT id, name
     FROM work_components
     WHERE project_id = $1 AND lower(btrim(name)) = lower($2)`,
    [boardId, trimmed]
  );
  if (existing[0]) return existing[0];
  try {
    const { rows } = await cloudSqlPool.query<{ id: string; name: string }>(
      `INSERT INTO work_components (project_id, name)
       VALUES ($1, $2)
       RETURNING id, name`,
      [boardId, trimmed]
    );
    const row = rows[0];
    if (!row) throw new Error("Failed to save component");
    return row;
  } catch (error) {
    const { rows } = await cloudSqlPool.query<{ id: string; name: string }>(
      `SELECT id, name
       FROM work_components
       WHERE project_id = $1 AND lower(btrim(name)) = lower($2)`,
      [boardId, trimmed]
    );
    if (rows[0]) return rows[0];
    throw error;
  }
}

export async function findBoardComponentByName(
  boardId: string,
  name: string
): Promise<{ id: string; name: string } | null> {
  const { rows } = await cloudSqlPool.query<{ id: string; name: string }>(
    `SELECT id, name
     FROM work_components
     WHERE project_id = $1 AND lower(btrim(name)) = lower($2)`,
    [boardId, name.trim()]
  );
  return rows[0] ?? null;
}

export async function renameBoardComponent(
  boardId: string,
  componentId: string,
  name: string
): Promise<{ id: string; name: string } | null> {
  const trimmed = name.trim();
  const { rows } = await cloudSqlPool.query<{ id: string; name: string }>(
    `UPDATE work_components
     SET name = $3
     WHERE id = $2 AND project_id = $1
     RETURNING id, name`,
    [boardId, componentId, trimmed]
  );
  return rows[0] ?? null;
}

export async function deleteBoardComponent(
  boardId: string,
  componentId: string
): Promise<boolean> {
  const result = await cloudSqlPool.query(
    `DELETE FROM work_components WHERE id = $1 AND project_id = $2`,
    [componentId, boardId]
  );
  return (result.rowCount ?? 0) === 1;
}

export async function countIssuesUsingComponent(
  boardId: string,
  componentId: string
): Promise<number> {
  const { rows } = await cloudSqlPool.query<{ n: string | number }>(
    `SELECT COUNT(*)::int AS n
     FROM work_issues
     WHERE project_id = $1 AND component_id = $2`,
    [boardId, componentId]
  );
  return Number(rows[0]?.n ?? 0);
}

export async function fetchIssueRequirements(issueIds: string[]) {
  if (issueIds.length === 0) return [];
  const { rows } = await cloudSqlPool.query<{
    id: string;
    issue_id: string;
    body: string;
    is_done: boolean;
    sort_order: number;
    kind: "acceptance" | "dod";
  }>(
    `SELECT id, issue_id, body, is_done, sort_order, kind
     FROM work_issue_requirements
     WHERE issue_id = ANY($1::uuid[])
     ORDER BY sort_order ASC, created_at ASC`,
    [issueIds]
  );
  return rows;
}

export async function insertWorkIssueRequirement(input: {
  issueId: string;
  body: string;
  kind: "acceptance" | "dod";
}): Promise<{ id: string; sortOrder: number }> {
  return withCloudSqlTransaction("work-add-requirement", async (client) => {
    const { rows: orderRows } = await client.query<{ next: number }>(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
       FROM work_issue_requirements
       WHERE issue_id = $1 AND kind = $2`,
      [input.issueId, input.kind]
    );
    const sortOrder = orderRows[0]?.next ?? 0;
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO work_issue_requirements (issue_id, body, sort_order, kind)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [input.issueId, input.body, sortOrder, input.kind]
    );
    const id = rows[0]?.id;
    if (!id) throw new Error("Failed to create requirement");
    return { id, sortOrder };
  });
}

export async function updateWorkIssueRequirementBody(
  issueId: string,
  requirementId: string,
  body: string
): Promise<boolean> {
  const result = await cloudSqlPool.query(
    `UPDATE work_issue_requirements
     SET body = $3, updated_at = now()
     WHERE id = $2 AND issue_id = $1`,
    [issueId, requirementId, body]
  );
  return (result.rowCount ?? 0) === 1;
}

export async function updateWorkIssueRequirementDone(
  boardId: string,
  issueId: string,
  requirementId: string,
  isDone: boolean,
  actorAppUserId: string
): Promise<boolean> {
  return withCloudSqlTransaction("work-check-requirement", async (client) => {
    const { rows } = await client.query<{ is_done: boolean; kind: "acceptance" | "dod" }>(
      `SELECT r.is_done, r.kind
       FROM work_issue_requirements r
       JOIN work_issues i ON i.id = r.issue_id
       WHERE i.project_id = $1 AND i.id = $2 AND r.id = $3
       FOR UPDATE OF r`,
      [boardId, issueId, requirementId]
    );
    const requirement = rows[0];

    if (!requirement) return false;
    if (requirement.is_done === isDone) return true;

    await client.query(
      `UPDATE work_issue_requirements SET is_done = $2, updated_at = now() WHERE id = $1`,
      [requirementId, isDone]
    );
    const item = requirement.kind === "dod" ? "a definition-of-done item" : "a requirement";
    await client.query(
      `INSERT INTO work_issue_events (issue_id, actor_app_user_id, kind, summary)
       VALUES ($1, $2, 'requirement', $3)`,
      [issueId, actorAppUserId, `${isDone ? "checked" : "unchecked"} ${item}`]
    );

    return true;
  });
}

export async function deleteWorkIssueRequirement(
  issueId: string,
  requirementId: string
): Promise<boolean> {
  const result = await cloudSqlPool.query(
    `DELETE FROM work_issue_requirements
     WHERE id = $2 AND issue_id = $1`,
    [issueId, requirementId]
  );
  return (result.rowCount ?? 0) === 1;
}

export async function fetchIssuePreDeployActions(issueIds: string[]) {
  if (issueIds.length === 0) return [];
  const { rows } = await cloudSqlPool.query<{
    id: string;
    issue_id: string;
    body: string;
    is_done: boolean;
    sort_order: number;
  }>(
    `SELECT id, issue_id, body, is_done, sort_order
     FROM work_issue_pre_deploy_actions
     WHERE issue_id = ANY($1::uuid[])
     ORDER BY sort_order ASC, created_at ASC`,
    [issueIds]
  );
  return rows;
}

export async function insertWorkIssuePreDeployAction(input: {
  issueId: string;
  body: string;
}): Promise<{ id: string; sortOrder: number }> {
  return withCloudSqlTransaction("work-add-pre-deploy", async (client) => {
    const { rows: orderRows } = await client.query<{ next: number }>(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
       FROM work_issue_pre_deploy_actions
       WHERE issue_id = $1`,
      [input.issueId]
    );
    const sortOrder = orderRows[0]?.next ?? 0;
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO work_issue_pre_deploy_actions (issue_id, body, sort_order)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [input.issueId, input.body, sortOrder]
    );
    const id = rows[0]?.id;
    if (!id) throw new Error("Failed to create pre-deploy action");
    return { id, sortOrder };
  });
}

export async function updateWorkIssuePreDeployActionBody(
  issueId: string,
  actionId: string,
  body: string
): Promise<boolean> {
  const result = await cloudSqlPool.query(
    `UPDATE work_issue_pre_deploy_actions
     SET body = $3, updated_at = now()
     WHERE id = $2 AND issue_id = $1`,
    [issueId, actionId, body]
  );
  return (result.rowCount ?? 0) === 1;
}

export async function updateWorkIssuePreDeployActionDone(
  issueId: string,
  actionId: string,
  isDone: boolean
): Promise<boolean> {
  const result = await cloudSqlPool.query(
    `UPDATE work_issue_pre_deploy_actions
     SET is_done = $3, updated_at = now()
     WHERE id = $2 AND issue_id = $1`,
    [issueId, actionId, isDone]
  );
  return (result.rowCount ?? 0) === 1;
}

export async function deleteWorkIssuePreDeployAction(
  issueId: string,
  actionId: string
): Promise<boolean> {
  const result = await cloudSqlPool.query(
    `DELETE FROM work_issue_pre_deploy_actions
     WHERE id = $2 AND issue_id = $1`,
    [issueId, actionId]
  );
  return (result.rowCount ?? 0) === 1;
}

export async function fetchIssueReferences(issueIds: string[]) {
  if (issueIds.length === 0) return [];
  const { rows } = await cloudSqlPool.query<{
    id: string;
    issue_id: string;
    url: string;
    label: string;
    sort_order: number;
  }>(
    `SELECT id, issue_id, url, label, sort_order
     FROM work_issue_references
     WHERE issue_id = ANY($1::uuid[])
     ORDER BY sort_order ASC, created_at ASC`,
    [issueIds]
  );
  return rows;
}

export async function insertWorkIssueReference(input: {
  boardId: string;
  issueId: string;
  url: string;
  label: string;
  actorAppUserId: string;
}): Promise<{ id: string; sortOrder: number } | null> {
  return withCloudSqlTransaction("work-add-reference", async (client) => {
    const issue = await client.query(
      `SELECT id FROM work_issues WHERE project_id = $1 AND id = $2 FOR UPDATE`,
      [input.boardId, input.issueId]
    );

    if (issue.rowCount !== 1) return null;

    const { rows: orderRows } = await client.query<{ next: number }>(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
       FROM work_issue_references
       WHERE issue_id = $1`,
      [input.issueId]
    );
    const sortOrder = orderRows[0]?.next ?? 0;
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO work_issue_references (issue_id, url, label, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [input.issueId, input.url, input.label, sortOrder]
    );
    const id = rows[0]?.id;
    if (!id) throw new Error("Failed to create reference");

    await client.query(
      `INSERT INTO work_issue_events (issue_id, actor_app_user_id, kind, summary)
       VALUES ($1, $2, 'reference', 'added a reference')`,
      [input.issueId, input.actorAppUserId]
    );

    return { id, sortOrder };
  });
}

export async function deleteWorkIssueReference(
  issueId: string,
  referenceId: string
): Promise<boolean> {
  const result = await cloudSqlPool.query(
    `DELETE FROM work_issue_references
     WHERE id = $2 AND issue_id = $1`,
    [issueId, referenceId]
  );
  return (result.rowCount ?? 0) === 1;
}

export async function fetchLoggedHoursByIssueIds(
  issueIds: string[]
): Promise<Map<string, number>> {
  const hours = new Map<string, number>();
  if (issueIds.length === 0) return hours;
  const { rows } = await cloudSqlPool.query<{
    work_issue_id: string;
    hours: string | number | null;
  }>(
    // Line ids are reused across weeks (PK includes iso_year/iso_week). Match the
    // entry's ISO week so carried-forward copies do not double-count hours.
    `SELECT l.work_issue_id, COALESCE(SUM(e.hours), 0) AS hours
     FROM time_report_entry_lines l
     JOIN time_report_entries e
       ON e.entry_line_id = l.id
      AND e.consultant_id = l.consultant_id
      AND l.iso_year = EXTRACT(ISOYEAR FROM e.entry_date)::int
      AND l.iso_week = EXTRACT(WEEK FROM e.entry_date)::int
     WHERE l.work_issue_id = ANY($1::uuid[])
     GROUP BY l.work_issue_id`,
    [issueIds]
  );
  for (const row of rows) {
    hours.set(row.work_issue_id, Number(row.hours ?? 0));
  }
  return hours;
}

export async function workIssueHasLoggedTime(
  issueId: string
): Promise<boolean> {
  const { rows } = await cloudSqlPool.query<{ ok: number }>(
    `SELECT 1 AS ok
     FROM time_report_entry_lines l
     JOIN time_report_entries e
       ON e.entry_line_id = l.id
      AND e.consultant_id = l.consultant_id
      AND l.iso_year = EXTRACT(ISOYEAR FROM e.entry_date)::int
      AND l.iso_week = EXTRACT(WEEK FROM e.entry_date)::int
     WHERE l.work_issue_id = $1
       AND e.hours > 0
     LIMIT 1`,
    [issueId]
  );
  return rows.length > 0;
}

export async function deleteWorkIssue(
  boardId: string,
  issueId: string
): Promise<boolean> {
  const { rowCount } = await cloudSqlPool.query(
    `DELETE FROM work_issues
     WHERE id = $2 AND project_id = $1`,
    [boardId, issueId]
  );
  return (rowCount ?? 0) > 0;
}

export async function addWorkIssueAssignee(
  issueId: string,
  appUserId: string
): Promise<boolean> {
  const result = await cloudSqlPool.query(
    `INSERT INTO work_issue_assignees (issue_id, app_user_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [issueId, appUserId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function removeWorkIssueAssignee(
  issueId: string,
  appUserId: string
): Promise<void> {
  await cloudSqlPool.query(
    `DELETE FROM work_issue_assignees WHERE issue_id = $1 AND app_user_id = $2`,
    [issueId, appUserId]
  );
}

export async function findOrCreateBoardLabel(
  boardId: string,
  name: string,
  client?: PoolClient
): Promise<{ id: string; name: string }> {
  const db = client ?? cloudSqlPool;
  const { rows: existing } = await db.query<{
    id: string;
    name: string;
  }>(
    `SELECT id, name
     FROM work_issue_labels
     WHERE project_id = $1 AND lower(name) = lower($2)`,
    [boardId, name]
  );
  if (existing[0]) return existing[0];

  const { rows } = await db.query<WorkLabel>(
    `INSERT INTO work_issue_labels (project_id, name)
     VALUES ($1, $2)
     ON CONFLICT (project_id, lower(name)) DO UPDATE SET name = work_issue_labels.name
     RETURNING id, name`,
    [boardId, name]
  );
  const row = rows[0];

  if (!row) throw new Error("Failed to save label");

  return row;
}

/** Caller verifies and locks the issue in its project before replacing its labels. */
async function replaceWorkIssueLabels(
  client: PoolClient,
  boardId: string,
  issueId: string,
  names: string[],
  actorAppUserId: string | null
): Promise<void> {
  const { rows: previous } = await client.query<{ label_id: string }>(
    "SELECT label_id FROM work_issue_label_links WHERE issue_id = $1",
    [issueId]
  );
  const labels = new Map<string, WorkLabel>();

  for (const name of names) {
    const label = await findOrCreateBoardLabel(boardId, name, client);
    labels.set(label.id, label);
  }

  const labelIds = [...labels.keys()];

  if (previous.length === labelIds.length && previous.every((row) => labels.has(row.label_id))) return;

  await client.query(
    "DELETE FROM work_issue_label_links WHERE issue_id = $1 AND NOT (label_id = ANY($2::uuid[]))",
    [issueId, labelIds]
  );

  for (const labelId of labelIds) {
    await client.query(
      `INSERT INTO work_issue_label_links (issue_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [issueId, labelId]
    );
  }

  if (actorAppUserId) {
    await client.query(
      `INSERT INTO work_issue_events (issue_id, actor_app_user_id, kind, summary)
       VALUES ($1, $2, 'labels', $3)`,
      [issueId, actorAppUserId, labels.size > 0 ? `set labels to ${[...labels.values()].map((label) => label.name).join(", ")}` : "cleared labels"]
    );
  }
}

export async function linkWorkIssueLabel(
  issueId: string,
  labelId: string
): Promise<void> {
  await cloudSqlPool.query(
    `INSERT INTO work_issue_label_links (issue_id, label_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [issueId, labelId]
  );
}

export async function unlinkWorkIssueLabel(
  issueId: string,
  labelId: string
): Promise<void> {
  await cloudSqlPool.query(
    `DELETE FROM work_issue_label_links WHERE issue_id = $1 AND label_id = $2`,
    [issueId, labelId]
  );
}

export async function insertWorkIssueComment(input: {
  boardId: string;
  issueId: string;
  authorAppUserId: string;
  body: string;
}): Promise<string | null> {
  return withCloudSqlTransaction("work-add-comment", async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO work_issue_comments (issue_id, author_app_user_id, body)
       SELECT id, $3, $4 FROM work_issues WHERE project_id = $1 AND id = $2
       RETURNING id`,
      [input.boardId, input.issueId, input.authorAppUserId, input.body]
    );
    const id = rows[0]?.id;

    if (!id) return null;

    await client.query(
      `INSERT INTO work_issue_events (issue_id, actor_app_user_id, kind, summary)
       VALUES ($1, $2, 'comment', 'added a comment')`,
      [input.issueId, input.authorAppUserId]
    );

    return id;
  });
}

/** Insert many comments on one issue in a single transaction (Jira import). */
export async function insertWorkIssueCommentsBatch(input: {
  boardId: string;
  issueId: string;
  authorAppUserId: string;
  bodies: string[];
}): Promise<number> {
  const bodies = input.bodies.map((b) => b.trim()).filter(Boolean);
  if (bodies.length === 0) return 0;

  return withCloudSqlTransaction("work-add-comments-batch", async (client) => {
    const { rows: owned } = await client.query<{ id: string }>(
      `SELECT id FROM work_issues WHERE project_id = $1 AND id = $2`,
      [input.boardId, input.issueId]
    );
    if (!owned[0]) return 0;

    for (const body of bodies) {
      await client.query(
        `INSERT INTO work_issue_comments (issue_id, author_app_user_id, body)
         VALUES ($1, $2, $3)`,
        [input.issueId, input.authorAppUserId, body]
      );
    }

    await client.query(
      `INSERT INTO work_issue_events (issue_id, actor_app_user_id, kind, summary)
       VALUES ($1, $2, 'comment', $3)`,
      [
        input.issueId,
        input.authorAppUserId,
        bodies.length === 1
          ? "added a comment"
          : `added ${bodies.length} comments`,
      ]
    );

    return bodies.length;
  });
}

export async function updateWorkIssueComment(input: {
  commentId: string;
  issueId: string;
  authorAppUserId: string;
  body: string;
}): Promise<boolean> {
  const result = await cloudSqlPool.query(
    `UPDATE work_issue_comments
     SET body = $4
     WHERE id = $1 AND issue_id = $2 AND author_app_user_id = $3`,
    [input.commentId, input.issueId, input.authorAppUserId, input.body]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteWorkIssueComment(input: {
  commentId: string;
  issueId: string;
  authorAppUserId: string;
}): Promise<boolean> {
  const result = await cloudSqlPool.query(
    `DELETE FROM work_issue_comments
     WHERE id = $1 AND issue_id = $2 AND author_app_user_id = $3`,
    [input.commentId, input.issueId, input.authorAppUserId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function fetchWorkIssueNotifyMeta(
  boardId: string,
  issueId: string
): Promise<{
  number: number;
  title: string;
  owner_app_user_id: string | null;
} | null> {
  const { rows } = await cloudSqlPool.query<{
    number: number;
    title: string;
    owner_app_user_id: string | null;
  }>(
    `SELECT number, title, owner_app_user_id
     FROM work_issues
     WHERE id = $1 AND project_id = $2`,
    [issueId, boardId]
  );
  return rows[0] ?? null;
}

export async function fetchWorkIssueDescription(
  boardId: string,
  issueId: string
): Promise<string | null> {
  const { rows } = await cloudSqlPool.query<{ description: string }>(
    `SELECT description
     FROM work_issues
     WHERE id = $1 AND project_id = $2`,
    [issueId, boardId]
  );
  return rows[0]?.description ?? null;
}

export async function fetchWorkIssueCreatedByAppUserId(
  boardId: string,
  issueId: string
): Promise<string | null> {
  const { rows } = await cloudSqlPool.query<{
    created_by_app_user_id: string | null;
  }>(
    `SELECT created_by_app_user_id
     FROM work_issues
     WHERE id = $1 AND project_id = $2`,
    [issueId, boardId]
  );
  return rows[0]?.created_by_app_user_id ?? null;
}

export async function moveWorkIssue(input: {
  boardId: string;
  issueId: string;
  status: WorkIssueStatus;
  sortOrder?: number;
  actorAppUserId: string;
  statusName: string;
  /** When moving to a non-done column, clear board-hide. */
  clearHiddenFromBoard?: boolean;
  /** When sortOrder is omitted, place above visible (non-hidden) cards. */
  prependIfNoOrder?: boolean;
}): Promise<number | null> {
  return withCloudSqlTransaction("work-move-issue", async (client) => {
    // Serialize appends with issue creation so concurrent moves get distinct positions.
    await client.query("SELECT id FROM work_projects WHERE id = $1 FOR UPDATE", [input.boardId]);
    const { rows: previous } = await client.query<{ status: string }>(
      "SELECT status FROM work_issues WHERE project_id = $1 AND id = $2 FOR UPDATE",
      [input.boardId, input.issueId]
    );

    if (!previous[0]) return null;

    // Default append at end; when sortOrder is omitted and prependIfNoOrder is set
    // (Done columns), place above all currently visible (non-hidden) cards.
    const { rows } = await client.query<{ sort_order: number }>(
      `UPDATE work_issues
       SET status = $3,
           sort_order = COALESCE(
             $4::int,
             CASE
               WHEN $6::boolean THEN (
                 SELECT COALESCE(MIN(sort_order), 0) - 1
                 FROM work_issues
                 WHERE project_id = $1
                   AND status = $3
                   AND id <> $2
                   AND hidden_from_board_at IS NULL
               )
               ELSE (
                 SELECT COALESCE(MAX(sort_order), -1) + 1
                 FROM work_issues
                 WHERE project_id = $1 AND status = $3 AND id <> $2
               )
             END
           ),
           hidden_from_board_at = CASE
             WHEN $5::boolean THEN NULL
             ELSE hidden_from_board_at
           END
       WHERE project_id = $1 AND id = $2
       RETURNING sort_order`,
      [
        input.boardId,
        input.issueId,
        input.status,
        input.sortOrder ?? null,
        Boolean(input.clearHiddenFromBoard),
        Boolean(input.prependIfNoOrder),
      ]
    );

    if (previous[0].status !== input.status) {
      await client.query(
        `INSERT INTO work_issue_events (issue_id, actor_app_user_id, kind, summary)
         VALUES ($1, $2, 'status', $3)`,
        [input.issueId, input.actorAppUserId, `changed status to ${input.statusName}`]
      );
    }

    return rows[0].sort_order;
  });
}

/** Hide all currently visible (non-hidden) issues in Done columns. */
export async function hideDoneIssuesOnBoard(
  boardId: string
): Promise<number> {
  const { rowCount } = await cloudSqlPool.query(
    `UPDATE work_issues i
     SET hidden_from_board_at = now()
     FROM work_project_statuses s
     WHERE i.project_id = $1
       AND i.status = s.id
       AND s.project_id = $1
       AND s.is_done = true
       AND i.hidden_from_board_at IS NULL`,
    [boardId]
  );
  return rowCount ?? 0;
}

/** Unhide all board-hidden issues on the project. */
export async function unhideHiddenIssuesOnBoard(
  boardId: string
): Promise<number> {
  const { rowCount } = await cloudSqlPool.query(
    `UPDATE work_issues
     SET hidden_from_board_at = NULL
     WHERE project_id = $1
       AND hidden_from_board_at IS NOT NULL`,
    [boardId]
  );
  return rowCount ?? 0;
}

export async function fetchWorkIssueStatus(
  boardId: string,
  issueId: string
): Promise<WorkIssueStatus | null> {
  const { rows } = await cloudSqlPool.query<{ status: WorkIssueStatus }>(
    `SELECT status FROM work_issues WHERE id = $2 AND project_id = $1`,
    [boardId, issueId]
  );
  return rows[0]?.status ?? null;
}

export async function reorderWorkIssuesInStatus(input: {
  boardId: string;
  status: WorkIssueStatus;
  issueIds: string[];
}): Promise<void> {
  await withCloudSqlTransaction("work-reorder-issues", async (client) => {
    for (let index = 0; index < input.issueIds.length; index += 1) {
      await client.query(
        `UPDATE work_issues
         SET status = $3, sort_order = $4
         WHERE id = $2 AND project_id = $1`,
        [input.boardId, input.issueIds[index], input.status, index]
      );
    }
  });
}

export async function insertWorkIssueFile(input: {
  issueId: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  content: Buffer;
  uploadedByAppUserId: string;
}): Promise<string> {
  const { rows } = await cloudSqlPool.query<{ id: string }>(
    `INSERT INTO work_issue_files (
       issue_id, file_name, mime_type, byte_size, content, uploaded_by_app_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      input.issueId,
      input.fileName,
      input.mimeType,
      input.byteSize,
      input.content,
      input.uploadedByAppUserId,
    ]
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("Failed to upload file");
  return id;
}

export async function fetchWorkIssueFileForDownload(fileId: string): Promise<{
  id: string;
  issue_id: string;
  project_id: string;
  file_name: string;
  mime_type: string;
  content: Buffer;
} | null> {
  const { rows } = await cloudSqlPool.query<{
    id: string;
    issue_id: string;
    project_id: string;
    file_name: string;
    mime_type: string;
    content: Buffer;
  }>(
    `SELECT f.id, f.issue_id, i.project_id, f.file_name, f.mime_type, f.content
     FROM work_issue_files f
     JOIN work_issues i ON i.id = f.issue_id
     WHERE f.id = $1`,
    [fileId]
  );
  return rows[0] ?? null;
}

export async function deleteWorkIssueFile(
  issueId: string,
  fileId: string
): Promise<string | null> {
  const { rows } = await cloudSqlPool.query<{ file_name: string }>(
    `DELETE FROM work_issue_files
     WHERE id = $2 AND issue_id = $1
     RETURNING file_name`,
    [issueId, fileId]
  );
  return rows[0]?.file_name ?? null;
}

export async function fetchWorkIssueRelations(boardId: string, client?: PoolClient) {
  const { rows } = await (client ?? cloudSqlPool).query<{
    id: string;
    project_id: string;
    from_issue_id: string;
    to_issue_id: string;
    kind: "blocks" | "relates" | "parent";
  }>(
    `SELECT id, project_id, from_issue_id, to_issue_id, kind
     FROM work_issue_relations
     WHERE project_id = $1`,
    [boardId]
  );
  return rows;
}

export async function insertWorkIssueRelation(input: {
  boardId: string;
  fromIssueId: string;
  toIssueId: string;
  kind: "blocks" | "relates" | "parent";
}, client?: PoolClient): Promise<string> {
  const { rows } = await (client ?? cloudSqlPool).query<{ id: string }>(
    `INSERT INTO work_issue_relations (project_id, from_issue_id, to_issue_id, kind)
     SELECT $1, $2, $3, $4
     WHERE EXISTS (
       SELECT 1 FROM work_issues WHERE id = $2 AND project_id = $1
     )
       AND EXISTS (
         SELECT 1 FROM work_issues WHERE id = $3 AND project_id = $1
       )
     RETURNING id`,
    [input.boardId, input.fromIssueId, input.toIssueId, input.kind]
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("Issue not found");
  return id;
}

export async function deleteWorkIssueRelation(
  boardId: string,
  relationId: string
): Promise<{ fromIssueId: string; toIssueId: string; kind: string } | null> {
  const { rows } = await cloudSqlPool.query<{
    from_issue_id: string;
    to_issue_id: string;
    kind: string;
  }>(
    `DELETE FROM work_issue_relations
     WHERE id = $2 AND project_id = $1
     RETURNING from_issue_id, to_issue_id, kind`,
    [boardId, relationId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    fromIssueId: row.from_issue_id,
    toIssueId: row.to_issue_id,
    kind: row.kind,
  };
}

/**
 * Move an issue to another Work project. Allocates a new number, remaps status,
 * clears project-scoped fields (sprint, component, labels, relations).
 */
export async function moveWorkIssueToProject(input: {
  issueId: string;
  fromProjectId: string;
  toProjectId: string;
  /** Prefer this status name on the target board (case-insensitive). */
  preferredStatusName?: string | null;
  actorAppUserId: string;
  eventSummary?: string;
}): Promise<{ number: number; statusId: string }> {
  if (input.fromProjectId === input.toProjectId) {
    throw new Error("Issue is already on the target board");
  }

  return withCloudSqlTransaction("work-move-issue-project", async (client) => {
    // Lock both projects in stable order to avoid deadlocks.
    const [first, second] =
      input.fromProjectId < input.toProjectId
        ? [input.fromProjectId, input.toProjectId]
        : [input.toProjectId, input.fromProjectId];
    await client.query(`SELECT id FROM work_projects WHERE id = $1 FOR UPDATE`, [
      first,
    ]);
    await client.query(`SELECT id FROM work_projects WHERE id = $1 FOR UPDATE`, [
      second,
    ]);

    const { rows: issueRows } = await client.query<{
      id: string;
      title: string;
    }>(
      `SELECT id, title FROM work_issues
       WHERE id = $1 AND project_id = $2
       FOR UPDATE`,
      [input.issueId, input.fromProjectId]
    );
    if (!issueRows[0]) throw new Error("Issue not found on source board");

    const { rows: targetOk } = await client.query<{ id: string }>(
      `SELECT id FROM work_projects
       WHERE id = $1 AND archived_at IS NULL`,
      [input.toProjectId]
    );
    if (!targetOk[0]) throw new Error("Target board not found or archived");

    const { rows: statusRows } = await client.query<{
      id: string;
      name: string;
      is_done: boolean;
      sort_order: number;
    }>(
      `SELECT id, name, is_done, sort_order
       FROM work_project_statuses
       WHERE project_id = $1
       ORDER BY sort_order, name`,
      [input.toProjectId]
    );
    if (statusRows.length === 0) {
      throw new Error("Target board has no columns");
    }

    let statusId = statusRows[0].id;
    const preferred = input.preferredStatusName?.trim().toLowerCase();
    if (preferred) {
      const hit = statusRows.find((s) => s.name.toLowerCase() === preferred);
      if (hit) statusId = hit.id;
    }

    const { rows: numberRows } = await client.query<{ next: number }>(
      `SELECT COALESCE(MAX(number), 0) + 1 AS next
       FROM work_issues
       WHERE project_id = $1`,
      [input.toProjectId]
    );
    const nextNumber = numberRows[0]?.next ?? 1;

    const { rows: orderRows } = await client.query<{ next: number }>(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
       FROM work_issues
       WHERE project_id = $1 AND status = $2`,
      [input.toProjectId, statusId]
    );

    await client.query(
      `DELETE FROM work_issue_label_links WHERE issue_id = $1`,
      [input.issueId]
    );
    await client.query(
      `DELETE FROM work_issue_relations
       WHERE from_issue_id = $1 OR to_issue_id = $1`,
      [input.issueId]
    );

    await client.query(
      `UPDATE work_issues
       SET project_id = $2,
           number = $3,
           status = $4,
           sort_order = $5,
           sprint_id = NULL,
           component_id = NULL,
           updated_at = now()
       WHERE id = $1`,
      [
        input.issueId,
        input.toProjectId,
        nextNumber,
        statusId,
        orderRows[0]?.next ?? 0,
      ]
    );

    await client.query(
      `INSERT INTO work_issue_events (issue_id, actor_app_user_id, kind, summary)
       VALUES ($1, $2, 'moved', $3)`,
      [
        input.issueId,
        input.actorAppUserId,
        input.eventSummary?.trim() || "moved the issue to another board",
      ]
    );

    return { number: nextNumber, statusId };
  });
}
